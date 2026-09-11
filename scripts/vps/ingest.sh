#!/usr/bin/env bash
# Run a data ingest on the VPS, straight into the platform's PostgreSQL.
#
# The database is not reachable from GitHub's runners, so ingestion runs next to
# it instead of in CI. The deploy workflow copies this script to
# /srv/apps/f1_api/ingest.sh on every deploy, so it needs no repo checkout on the
# server — only the app directory, its .env and its .tag.
#
# Usage (on the VPS):
#   /srv/apps/f1_api/ingest.sh                      # calendar-gated update
#   /srv/apps/f1_api/ingest.sh --force              # ignore the calendar gate
#   /srv/apps/f1_api/ingest.sh --force -- --laptimes --current-year
#                                                   # custom seed.py flags after `--`
#
# Scheduled by deploy/systemd/f1-tracker-ingest.timer.
#
# The ingestors upsert from one f1db release download plus Fast-F1 session data
# and write only to PostgreSQL, so this both bootstraps an empty database and
# updates a populated one.
set -euo pipefail

APP_DIR="${APP_DIR:-/srv/apps/f1_api}"
cd "$APP_DIR"

for f in .env .tag docker-compose.yml; do
  if [ ! -f "$f" ]; then
    echo "Error: $APP_DIR/$f not found." >&2
    echo "  .env comes from new-app.sh; docker-compose.yml and .tag are written" >&2
    echo "  by the deploy. Has this app ever been deployed?" >&2
    exit 1
  fi
done

dc() { docker compose --env-file .env --env-file .tag "$@"; }

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

# Bearer-token cache purge against the Next.js /api/revalidate route on Vercel.
# Non-fatal: the data is already live and the frontend's TTL backstops a failure.
echo "==> Purging frontend cache..."
REVALIDATE_URL="${REVALIDATE_URL:-$(grep -E '^REVALIDATE_URL=' .env | cut -d= -f2- || true)}"
REVALIDATE_SECRET="${REVALIDATE_SECRET:-$(grep -E '^REVALIDATE_SECRET=' .env | cut -d= -f2- || true)}"

if [ -z "$REVALIDATE_URL" ]; then
  echo "    REVALIDATE_URL not set in .env — skipping frontend cache purge."
elif curl -fsS --max-time 30 -X POST "$REVALIDATE_URL" \
       -H "Authorization: Bearer ${REVALIDATE_SECRET}"; then
  echo ""
  echo "    Frontend cache purged (f1-data tag)."
else
  echo ""
  echo "    Warning: cache purge failed — data is live; the TTL will refresh the frontend."
fi

echo ""
echo "==> Ingest complete."
