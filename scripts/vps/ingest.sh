#!/usr/bin/env bash
# Run a data ingest on the VPS, straight into the stack's PostgreSQL.
#
# This replaces the old GitHub Actions → Neon workflow: the database is no longer
# reachable from the internet, so ingestion runs next to it instead.
#
# Usage:
#   ./scripts/vps/ingest.sh                       # calendar-gated race-weekend update
#   ./scripts/vps/ingest.sh --force               # ignore the calendar gate
#   ./scripts/vps/ingest.sh --force -- --laptimes --current-year
#                                                 # custom seed.py flags after `--`
#
# Scheduled by deploy/systemd/f1-tracker-ingest.timer.
#
# Note: the image/logo/track-layout ingestors are deliberately NOT run here. They
# write into apps/web/public/, which Vercel serves from the git repo — run those
# locally and commit the result.
set -euo pipefail

# shellcheck source=_common.sh
. "$(cd "$(dirname "$0")" && pwd)/_common.sh"

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

if [ "$FORCE" = "1" ]; then
  echo "==> Calendar gate skipped (--force)."
else
  echo "==> Calendar gate: did a race run in the last $GATE_DAYS day(s)?"
  if ! dc run --rm --entrypoint python ingest \
        scripts/should_ingest.py --days "$GATE_DAYS" --exit-code; then
    echo "==> No recent race — nothing to ingest."
    exit 0
  fi
fi

echo "==> Running ingest..."
if [ ${#SEED_FLAGS[@]} -gt 0 ]; then
  # Explicit flags replace the default command; keep the container-safe ones.
  dc run --rm ingest "${SEED_FLAGS[@]}" --no-restore --no-backup
else
  dc run --rm ingest
fi

echo "==> Validating (informational)..."
dc run --rm --entrypoint python ingest scripts/validate.py || true

echo "==> Purging frontend cache..."
purge_frontend_cache

echo ""
echo "==> Ingest complete."
