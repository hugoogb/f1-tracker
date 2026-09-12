#!/usr/bin/env bash
# Pull Fast-F1 session data (lap times, qualifying sectors) onto the VPS — from
# this machine, because no server can do it any more.
#
# Formula 1 answers `livetiming.formula1.com` with a 403 for datacentre IPs. The
# VPS is in one; so are GitHub's runners, which was measured, not assumed (see
# docs/DEPLOYMENT.md). A residential connection still works, so the fetch runs
# wherever you are and only the database half runs on the box:
#
#   1. ask the server what is missing   ssh … fastf1.sh status  → targets.json
#   2. fetch it here                    pipeline/scripts/fastf1_fetch.py
#   3. load it there                    ssh … fastf1.sh import  < payload
#
# Run it after a race weekend, once the Monday ingest has created the race rows
# (that run's job summary says how many races are waiting).
#
# Usage:
#   pnpm fastf1                      # the whole job: 8 most recent sessions
#   pnpm fastf1 --all                # everything still missing (hours; safe to stop)
#   pnpm fastf1 --limit 24 --oldest-first
#   pnpm fastf1 --need laps --year-range 2018-2019
#   pnpm fastf1 --refresh-positions --all
#                                    # one-off: re-fetch races whose laps were
#                                    # stored before per-lap positions were kept
#   pnpm fastf1 --dry-run            # fetch, but write nothing to the database
#   pnpm fastf1 --probe              # can this machine reach Fast-F1 at all?
#
# `./scripts/fastf1-sync.sh` works the same if you would rather not go through
# pnpm.
#
# Setup, once: put the server's tailnet address in .env as
#
#   VPS_HOST=100.x.y.z
#
# after which this needs no arguments. VPS_HOST/VPS_USER in the environment or
# --host/--user override it.
#
# Every session costs ~45 s of rate-limit throttle, so a backfill is slow by
# design. The payload is written as it is fetched and kept afterwards, so
# stopping halfway is safe: what was fetched still imports, and what was not is
# still missing next time.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.env}"
PAYLOAD_DIR="${PAYLOAD_DIR:-$ROOT/.fastf1_payloads}"
APP_DIR="${APP_DIR:-/srv/apps/f1_api}"
SSH_OPTS=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=30)

# Read one KEY=value out of .env. The file is shared with the frontend, the
# backend and docker compose, so it is parsed rather than sourced — no eval of
# whatever else happens to be in there.
env_value() {
  [ -f "$ENV_FILE" ] || return 0
  sed -n "s/^$1=//p" "$ENV_FILE" | tail -1 | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

HOST="${VPS_HOST:-$(env_value VPS_HOST)}"
USER_NAME="${VPS_USER:-$(env_value VPS_USER)}"
NEED="laps,quali_sectors"
LIMIT="8"
YEAR_RANGE=""
ORDER=""
REFRESH_POSITIONS=""
DRY_RUN=0
PROBE=0

usage() {
  sed -n '2,40p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-2}"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --host) HOST="$2"; shift 2 ;;
    --user) USER_NAME="$2"; shift 2 ;;
    --need) NEED="$2"; shift 2 ;;
    --limit) LIMIT="$2"; shift 2 ;;
    --all) LIMIT=""; shift ;;
    --year-range) YEAR_RANGE="$2"; shift 2 ;;
    --oldest-first) ORDER="--oldest-first"; shift ;;
    --refresh-positions) REFRESH_POSITIONS="--refresh-positions"; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --probe) PROBE=1; shift ;;
    -h|--help) usage 0 ;;
    *) echo "Unknown argument: $1" >&2; usage ;;
  esac
done

# The probe needs nothing but this machine's network, so it comes before the
# host check — it is the first thing to run on a laptop you have not used for
# this before, or on a connection that has started failing.
if [ "$PROBE" = "1" ]; then
  cd "$ROOT/pipeline"
  exec uv run python scripts/fastf1_fetch.py --probe
fi

if [ -z "$HOST" ]; then
  cat >&2 <<EOF
Error: the server's address is not set, so there is nowhere to send the data.

  Add it to $ENV_FILE (once):

      VPS_HOST=100.x.y.z        # the tailnet address of the VPS

  or pass it per run: $0 --host 100.x.y.z
EOF
  exit 2
fi
case "$HOST" in
  *@*) TARGET="$HOST" ;;
  *) TARGET="${USER_NAME:-hugo}@$HOST" ;;
esac

status_args=(--need "$NEED")
[ -n "$LIMIT" ] && status_args+=(--limit "$LIMIT")
[ -n "$ORDER" ] && status_args+=("$ORDER")
[ -n "$YEAR_RANGE" ] && status_args+=(--year-range "$YEAR_RANGE")
[ -n "$REFRESH_POSITIONS" ] && status_args+=("$REFRESH_POSITIONS")

echo "==> Asking $TARGET what is missing..."
targets="$(mktemp)"
trap 'rm -f "$targets"' EXIT
# fastf1.sh keeps its progress on stderr; stdout is the single JSON line. Take
# the last line starting with `{` in case docker compose narrates on stdout too.
ssh "${SSH_OPTS[@]}" "$TARGET" "$APP_DIR/fastf1.sh status ${status_args[*]}" \
  | grep '^{' | tail -1 > "$targets"

count="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["count"])' "$targets")"
if [ "$count" = "0" ]; then
  echo "==> Nothing missing. Done."
  exit 0
fi
echo "    $count race(s) waiting on Fast-F1 data."

mkdir -p "$PAYLOAD_DIR"
payload="$PAYLOAD_DIR/payload-$(date -u +%Y%m%dT%H%M%SZ).ndjson.gz"

fetch_args=(--targets "$targets" --need "$NEED" --out "$payload")
[ -n "$LIMIT" ] && fetch_args+=(--limit "$LIMIT")

echo "==> Fetching here (~45s per session, Ctrl-C is safe)..."
cd "$ROOT/pipeline"
uv run python scripts/fastf1_fetch.py "${fetch_args[@]}"

if [ ! -s "$payload" ]; then
  echo "==> Nothing was fetched — no payload to load." >&2
  exit 1
fi
echo "    Payload: $payload ($(du -h "$payload" | cut -f1))"

import_args=""
[ "$DRY_RUN" = "1" ] && import_args="--dry-run"

echo "==> Loading it on $TARGET..."
ssh "${SSH_OPTS[@]}" "$TARGET" "$APP_DIR/fastf1.sh import $import_args" < "$payload"

echo ""
if [ "$DRY_RUN" = "1" ]; then
  echo "==> Dry run: nothing was written. The payload is kept at $payload."
else
  echo "==> Done. The payload is kept at $payload — delete it once the site looks right."
fi
