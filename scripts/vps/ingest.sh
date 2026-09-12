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
#   /srv/apps/f1_api/ingest.sh --force -- --results --current-year
#                                                   # custom seed.py flags after `--`
#
# Scheduled by .github/workflows/ingest.yml.
#
# The ingestors upsert from one f1db release download and write only to
# PostgreSQL, so this both bootstraps an empty database and updates a populated
# one.
#
# NOT here: lap times and qualifying sector times (--laptimes,
# --qualifying-sectors). Formula 1 blocks this box's IP, so those are fetched
# off-box and loaded with fastf1.sh — see that script and docs/DEPLOYMENT.md.
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
  # </dev/null on every `compose run`: it attaches stdin, so when this script
  # is fed to a shell over SSH rather than executed from disk it would consume
  # the rest of itself.
  if ! dc run --rm -T --entrypoint python ingest \
        scripts/should_ingest.py --days "$GATE_DAYS" --exit-code </dev/null; then
    echo "==> No recent race — nothing to ingest."
    exit 0
  fi
fi

echo "==> Running ingest..."
if [ ${#SEED_FLAGS[@]} -gt 0 ]; then
  # Explicit flags replace the default command; keep the container-safe ones.
  dc run --rm -T ingest "${SEED_FLAGS[@]}" --no-restore --no-backup </dev/null
else
  dc run --rm -T ingest </dev/null
fi

echo "==> Validating (informational)..."
dc run --rm -T --entrypoint python ingest scripts/validate.py </dev/null || true

# Cache purge against the Next.js /api/revalidate route on Vercel. Shared with
# fastf1.sh, which changes the same data; both get it from purge-cache.sh, also
# shipped by the deploy.
if [ -x "$APP_DIR/purge-cache.sh" ]; then
  "$APP_DIR/purge-cache.sh"
else
  echo "    purge-cache.sh not found — skipping frontend cache purge."
fi

echo ""
echo "==> Ingest complete."
