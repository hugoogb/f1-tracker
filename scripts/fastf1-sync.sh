#!/usr/bin/env bash
# Pull Fast-F1 session data (lap times, qualifying sectors) onto the VPS — from
# this machine, because no server can do it any more.
#
# Formula 1 answers `livetiming.formula1.com` with a 403 for datacentre IPs. The
# VPS is in one; so are GitHub's runners, which was measured, not assumed (see
# docs/DEPLOYMENT.md). A residential connection still works, so the fetch runs
# wherever you are and only the database half runs on the box:
#
#   1. ask the server what is missing   job fastf1_status.py     → targets.json
#   2. fetch it here                    pipeline/scripts/fastf1_fetch.py
#   3. load it there                    job fastf1_import.py     < payload
#
# Run it after a race weekend, once the Monday ingest has created the race rows
# (that run's job summary says how many races are waiting).
#
# Since October 2026 the live timing archive also needs a Formula 1 account with
# an F1 TV subscription (Access or higher). The script checks for one before it
# asks the server anything and prompts for a sign-in when there is none; to
# sign in ahead of time (the token lasts about four days):
#
#   cd pipeline && uv run python -m fastf1 auth f1tv --authenticate
#
# or export F1_USERNAME / F1_PASSWORD. Exit status 4 means no usable account.
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
#   pnpm fastf1 --purge              # only purge the frontend cache (after an
#                                    # import whose purge failed)
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
# Every server-side step is a task container run through infra-setup's
# deploy-app.sh -- nothing runs on the server's host.
# shellcheck source=lib/vps.sh
source "$ROOT/scripts/lib/vps.sh"

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
PURGE=0

usage() {
  sed -n '2,52p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
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
    --purge) PURGE=1; shift ;;
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
  *@*) VPS_TARGET="$HOST" ;;
  *) VPS_TARGET="${USER_NAME:-hugo}@$HOST" ;;
esac
TARGET="$VPS_TARGET"

if [ "$PURGE" = "1" ]; then
  echo "==> Purging the frontend cache from $TARGET..."
  vps_task job bash scripts/purge_cache.sh --all </dev/null
  exit $?
fi

# Before the server is asked anything: without an account every session would
# come back empty, 45 s at a time, and look like data that is not out yet.
# Exits 4 when there is none; a sign-in prompt, if any, happens here.
echo "==> Checking the Formula 1 account..."
(cd "$ROOT/pipeline" && uv run python scripts/fastf1_fetch.py --check-auth)

status_args=(--need "$NEED")
[ -n "$LIMIT" ] && status_args+=(--limit "$LIMIT")
[ -n "$ORDER" ] && status_args+=("$ORDER")
[ -n "$YEAR_RANGE" ] && status_args+=(--year-range "$YEAR_RANGE")
[ -n "$REFRESH_POSITIONS" ] && status_args+=("$REFRESH_POSITIONS")

echo "==> Asking $TARGET what is missing..."
targets="$(mktemp)"
trap 'rm -f "$targets"' EXIT
# The status script keeps its progress on stderr; stdout is the single JSON
# line. Take the last line starting with `{` in case anything narrates on stdout.
vps_task job python scripts/fastf1_status.py "${status_args[@]}" </dev/null \
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

# The payload always has its header line, so "not empty" is not enough: a run
# where every session came back empty must not go on to import nothing and
# expire the cache for it.
sessions=0
if [ -s "$payload" ]; then
  sessions="$(python3 -c 'import gzip,sys; print(sum(1 for _ in gzip.open(sys.argv[1])) - 1)' "$payload")"
fi
if [ "$sessions" -le 0 ]; then
  rm -f "$payload"
  echo "==> Nothing was fetched — nothing to load, and the cache is left alone." >&2
  echo "    If the race only just finished, its timing may not be published yet: re-run later." >&2
  exit 1
fi
echo "    Payload: $payload ($(du -h "$payload" | cut -f1))"

import_args=()
[ "$DRY_RUN" = "1" ] && import_args+=(--dry-run)

# Only the seasons in this payload need their pages expired. The target list is
# a superset of what was fetched (the fetch may stop early), which can only
# over-purge.
purge_years="$(python3 -c 'import json,sys; print(",".join(str(y) for y in sorted({t["year"] for t in json.load(open(sys.argv[1]))["targets"]})))' "$targets")"

echo "==> Loading it on $TARGET..."
import_status=0
# ${a[@]+"${a[@]}"}: macOS's bash 3.2 calls an empty array unbound under set -u.
vps_task job python scripts/fastf1_import.py --payload - ${import_args[@]+"${import_args[@]}"} < "$payload" \
  || import_status=$?

if [ "$import_status" = "0" ]; then
  echo "==> Validating (informational)..."
  vps_task job python scripts/validate.py </dev/null >&2 || true
  if [ "$DRY_RUN" != "1" ]; then
    # 3 = "data loaded, cache not purged": the import worked, but the site will
    # not show it until the purge does.
    if [ -n "$purge_years" ]; then
      vps_task job bash scripts/purge_cache.sh --years "$purge_years" </dev/null || import_status=3
    else
      vps_task job bash scripts/purge_cache.sh --all </dev/null || import_status=3
    fi
  fi
fi

if [ "$import_status" = "3" ]; then
  echo ""
  echo "==> The data is loaded, but the frontend cache was NOT purged — race pages"
  echo "    rendered before this run will keep showing the old data for up to a day."
  echo "    Fix the cause printed above, then: pnpm fastf1 --purge"
  exit 3
elif [ "$import_status" != "0" ]; then
  echo "==> Import failed (exit $import_status). The payload is kept at $payload." >&2
  exit "$import_status"
fi

echo ""
if [ "$DRY_RUN" = "1" ]; then
  echo "==> Dry run: nothing was written. The payload is kept at $payload."
else
  echo "==> Done. The payload is kept at $payload — delete it once the site looks right."
fi
