#!/usr/bin/env bash
# Run a data ingest on the VPS, straight into the platform's PostgreSQL.
#
# The database is not reachable from GitHub's runners, so the work runs next to
# it -- but nothing runs on the server's host: every step is a task container
# from docker/compose.prod.yml, started through infra-setup's deploy-app.sh
# (scripts/lib/vps.sh). This script only sequences them, from the CI runner or
# your laptop.
#
#   VPS_TARGET=deploy@100.x.y.z scripts/vps-ingest.sh                 # calendar-gated
#   VPS_TARGET=deploy@100.x.y.z scripts/vps-ingest.sh --force         # ignore the gate
#   VPS_TARGET=deploy@100.x.y.z scripts/vps-ingest.sh --force -- --results --current-year
#
# Scheduled by .github/workflows/ingest.yml; deploy.yml runs it with --force
# when asked to.
#
# The ingestors upsert from one f1db release download and write only to
# PostgreSQL, so this both bootstraps an empty database and updates a populated
# one. NOT here: lap times and qualifying sector times. Formula 1 blocks the
# server's IP, so those are fetched off-box (`pnpm fastf1`).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/vps.sh
source "$ROOT/scripts/lib/vps.sh"

FORCE=0
GATE_DAYS="${GATE_DAYS:-3}"
SEED_FLAGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --force) FORCE=1; shift ;;
    --) shift; SEED_FLAGS=("$@"); break ;;
    *) echo "Unknown argument: $1 (custom seed flags go after \`--\`)" >&2; exit 2 ;;
  esac
done
[[ "$GATE_DAYS" =~ ^[0-9]+$ ]] || { echo "GATE_DAYS must be a number" >&2; exit 2; }

if [ "$FORCE" = "1" ]; then
  echo "==> Calendar gate skipped (--force)."
else
  echo "==> Calendar gate: did a race run in the last $GATE_DAYS day(s)?"
  # 0 = ingest, 1 = skip. Anything else -- ssh failing (255), deploy-app
  # refusing (70) -- is an error, not a quiet week.
  gate=0
  vps_task job python scripts/should_ingest.py --days "$GATE_DAYS" --exit-code </dev/null || gate=$?
  case "$gate" in
    0) ;;
    1) echo "==> No recent race -- nothing to ingest."; exit 0 ;;
    *) echo "::error::The calendar check could not run (exit $gate)."; exit "$gate" ;;
  esac
fi

echo "==> Running ingest..."
if [ ${#SEED_FLAGS[@]} -gt 0 ]; then
  # Explicit flags replace the service's default command; keep the
  # container-safe ones (no restore/backup: those need a Docker CLI).
  vps_task ingest "${SEED_FLAGS[@]}" --no-restore --no-backup </dev/null
else
  vps_task ingest </dev/null
fi

echo "==> Validating (informational)..."
vps_task job python scripts/validate.py </dev/null || true

# The scheduled run only ever lands the race that just happened, so it expires
# the newest season (and the global lists) rather than every page. Custom seed
# flags can mean anything -- a backfill, a correction -- so those purge
# everything. Override with PURGE_SCOPE=--all|--latest.
if [ -z "${PURGE_SCOPE:-}" ]; then
  if [ ${#SEED_FLAGS[@]} -gt 0 ]; then PURGE_SCOPE=--all; else PURGE_SCOPE=--latest; fi
fi
case "$PURGE_SCOPE" in --all|--latest) ;; *) echo "PURGE_SCOPE must be --all or --latest" >&2; exit 2 ;; esac
PURGED=1
vps_task job bash scripts/purge_cache.sh "$PURGE_SCOPE" </dev/null || PURGED=0

echo ""
if [ "$PURGED" = "1" ]; then
  echo "==> Ingest complete."
else
  echo "==> Ingest complete, but the frontend cache was NOT purged -- pages may show"
  echo "    the old data for up to a day. Once fixed: pnpm fastf1 --purge"
fi
