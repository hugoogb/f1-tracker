#!/usr/bin/env bash
# Purge the Vercel cache for the frontend, from the VPS.
#
# Shared by ingest.sh and fastf1.sh — both change the data behind the same
# cached pages, and neither should carry its own copy of the bearer-token dance.
# The deploy copies this to /srv/apps/f1_api/purge-cache.sh.
#
# Deliberately non-fatal: by the time this runs the data is already live, and
# the frontend's own TTL refreshes it anyway. It always exits 0 so a caller can
# run it without `|| true` swallowing a real failure elsewhere.
#
# Usage (on the VPS):
#   /srv/apps/f1_api/purge-cache.sh
set -uo pipefail

APP_DIR="${APP_DIR:-/srv/apps/f1_api}"
cd "$APP_DIR" || exit 0

echo "==> Purging frontend cache..."
REVALIDATE_URL="${REVALIDATE_URL:-$(grep -E '^REVALIDATE_URL=' .env | cut -d= -f2- || true)}"
REVALIDATE_SECRET="${REVALIDATE_SECRET:-$(grep -E '^REVALIDATE_SECRET=' .env | cut -d= -f2- || true)}"

if [ -z "$REVALIDATE_URL" ]; then
  echo "    REVALIDATE_URL not set in .env — skipping frontend cache purge."
  exit 0
fi

if curl -fsS --max-time 30 -X POST "$REVALIDATE_URL" \
     -H "Authorization: Bearer ${REVALIDATE_SECRET}"; then
  echo ""
  echo "    Frontend cache purged (f1-data tag)."
else
  echo ""
  echo "    Warning: cache purge failed — data is live; the TTL will refresh the frontend."
fi

exit 0
