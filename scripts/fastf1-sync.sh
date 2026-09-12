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
# (that run's summary says how many races are waiting).
#
# Usage:
#   VPS_HOST=100.x.y.z ./scripts/fastf1-sync.sh              # 8 most recent sessions
#   ./scripts/fastf1-sync.sh --limit 24 --oldest-first       # chip away at the backfill
#   ./scripts/fastf1-sync.sh --need laps --year-range 2018-2019
#   ./scripts/fastf1-sync.sh --dry-run                       # fetch, but write nothing
#   ./scripts/fastf1-sync.sh --probe                         # can this machine fetch at all?
#
# Every session costs ~45 s of rate-limit throttle, so a backfill is slow by
# design. The payload is written as it is fetched and kept afterwards, so
# stopping halfway is safe: what was fetched still imports, and what was not is
# still missing next time.
#
# Env:
#   VPS_HOST    the server's tailnet address or hostname (or pass --host)
#   VPS_USER    SSH user, default hugo
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PAYLOAD_DIR="${PAYLOAD_DIR:-$ROOT/.fastf1_payloads}"
APP_DIR="${APP_DIR:-/srv/apps/f1_api}"
SSH_OPTS=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=30)

HOST="${VPS_HOST:-}"
USER_NAME="${VPS_USER:-hugo}"
NEED="laps,quali_sectors"
LIMIT="8"
YEAR_RANGE=""
ORDER=""
DRY_RUN=0
PROBE=0

usage() {
  sed -n '2,30p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-2}"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --host) HOST="$2"; shift 2 ;;
    --need) NEED="$2"; shift 2 ;;
    --limit) LIMIT="$2"; shift 2 ;;
    --year-range) YEAR_RANGE="$2"; shift 2 ;;
    --oldest-first) ORDER="--oldest-first"; shift ;;
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
  echo "Error: set VPS_HOST (the server's tailnet address) or pass --host." >&2
  echo "  VPS_HOST=100.x.y.z $0" >&2
  exit 2
fi
case "$HOST" in
  *@*) TARGET="$HOST" ;;
  *) TARGET="$USER_NAME@$HOST" ;;
esac

status_args=(--need "$NEED" --limit "$LIMIT")
[ -n "$ORDER" ] && status_args+=("$ORDER")
[ -n "$YEAR_RANGE" ] && status_args+=(--year-range "$YEAR_RANGE")

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

echo "==> Fetching here (~45s per session, Ctrl-C is safe)..."
cd "$ROOT/pipeline"
uv run python scripts/fastf1_fetch.py \
  --targets "$targets" \
  --need "$NEED" \
  --limit "$LIMIT" \
  --out "$payload"

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
