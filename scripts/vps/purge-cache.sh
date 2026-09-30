#!/usr/bin/env bash
# Purge the Vercel cache for the frontend, from the VPS.
#
# Shared by ingest.sh and fastf1.sh — both change the data behind the same
# cached pages, and neither should carry its own copy of the bearer-token dance.
# The deploy copies this to /srv/apps/f1_api/purge-cache.sh.
#
# Exit status: 0 when the frontend confirmed the purge, 1 otherwise (not
# configured, rejected, unreachable). Callers treat that as a warning, not a
# failure — the data is already live by the time this runs — but they must not
# hide it: until the purge lands, pages cached before the import keep serving
# the old data for up to a day (REVALIDATE_SECONDS). That is exactly how a race
# page kept saying "no lap time data" after a successful `pnpm fastf1`.
#
# A failure also prints a `::warning::` line. It is inert in a terminal, but
# GitHub Actions parses workflow commands out of any step's stdout — ssh output
# included — so the ingest run gets an annotation instead of a line buried in
# the log.
#
# Usage (on the VPS):
#   /srv/apps/f1_api/purge-cache.sh
set -uo pipefail

APP_DIR="${APP_DIR:-/srv/apps/f1_api}"
cd "$APP_DIR" || exit 1

fail() {
  echo "    $1"
  echo "::warning title=Frontend cache not purged::$1"
  exit 1
}

echo "==> Purging frontend cache..."
REVALIDATE_URL="${REVALIDATE_URL:-$(grep -E '^REVALIDATE_URL=' .env | cut -d= -f2- || true)}"
REVALIDATE_SECRET="${REVALIDATE_SECRET:-$(grep -E '^REVALIDATE_SECRET=' .env | cut -d= -f2- || true)}"

if [ -z "$REVALIDATE_URL" ]; then
  fail "REVALIDATE_URL is not set in $APP_DIR/.env, so cached pages keep the old data for up to a day."
fi
if [ -z "$REVALIDATE_SECRET" ]; then
  fail "REVALIDATE_SECRET is not set in $APP_DIR/.env, so the frontend will refuse the purge."
fi

body="$(mktemp)"
trap 'rm -f "$body"' EXIT
code="$(curl -sS --max-time 30 -o "$body" -w '%{http_code}' -X POST "$REVALIDATE_URL" \
          -H "Authorization: Bearer ${REVALIDATE_SECRET}")" || code="000"

case "$code" in
  200)
    echo "    Frontend cache purged (f1-data tag): $(cat "$body")"
    ;;
  401)
    fail "Purge rejected (401): REVALIDATE_SECRET in $APP_DIR/.env does not match the Vercel project's REVALIDATE_SECRET."
    ;;
  000)
    fail "Could not reach $REVALIDATE_URL (network error or timeout)."
    ;;
  *)
    fail "Purge failed with HTTP $code from $REVALIDATE_URL: $(head -c 300 "$body")"
    ;;
esac
