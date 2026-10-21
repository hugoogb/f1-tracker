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
# Scope. Expiring everything after every import made every cached page on the
# site — seventy-odd finished seasons and a thousand race pages among them —
# re-render on its next visit, which on Vercel's Hobby plan spends the ISR
# write and function budget on pages whose data did not move. So a purge can
# be narrowed to the seasons an import touched; the frontend then expires
# those seasons, the drivers/constructors/circuits in them and the global
# lists (see apps/web/app/api/revalidate/route.ts):
#
#   --all            everything (the default, and what an old frontend does
#                    with any request)
#   --latest         the newest season the API knows — the weekly ingest
#   --years Y[,Y..]  those seasons — a Fast-F1 import of specific races
#
# PURGE_YEARS=2025,2026 in the environment is the same as --years, so callers
# that only pass the environment through (fastf1.sh) need no flag plumbing.
#
# Usage (on the VPS):
#   /srv/apps/f1_api/purge-cache.sh [--all | --latest | --years 2025,2026]
set -uo pipefail

SCOPE=all
YEARS="${PURGE_YEARS:-}"
[ -n "$YEARS" ] && SCOPE=years
while [ $# -gt 0 ]; do
  case "$1" in
    --all) SCOPE=all; shift ;;
    --latest) SCOPE=latest; shift ;;
    --years) SCOPE=years; YEARS="${2:-}"; shift 2 || shift ;;
    *) echo "Unknown argument: $1 (expected --all, --latest or --years Y[,Y...])" >&2; exit 2 ;;
  esac
done

case "$SCOPE" in
  all) PAYLOAD='{"scope":"all"}' ;;
  latest) PAYLOAD='{"scope":"latest"}' ;;
  years)
    if ! printf '%s' "$YEARS" | grep -Eq '^[0-9]{4}(,[0-9]{4})*$'; then
      echo "Invalid years: '$YEARS' (expected e.g. 2025 or 2025,2026)" >&2
      exit 2
    fi
    PAYLOAD="{\"years\":[$YEARS]}"
    ;;
esac

APP_DIR="${APP_DIR:-/srv/apps/f1_api}"
cd "$APP_DIR" || exit 1

fail() {
  echo "    $1"
  echo "::warning title=Frontend cache not purged::$1"
  exit 1
}

echo "==> Purging frontend cache ($SCOPE${YEARS:+: $YEARS})..."
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
# No -L: a redirect means REVALIDATE_URL is wrong (http://, a trailing slash),
# and following it would downgrade the POST or leak the bearer token to
# wherever it points. Report it instead — the old `curl -f` counted a 308 as
# success, which is how every purge silently did nothing.
out="$(curl -sS --max-time 30 -o "$body" -w '%{http_code} %{redirect_url}' -X POST "$REVALIDATE_URL" \
          -H "Authorization: Bearer ${REVALIDATE_SECRET}" \
          -H 'Content-Type: application/json' --data "$PAYLOAD")" || out="000"
code="${out%% *}"
redirect="${out#* }"

case "$code" in
  200)
    echo "    Frontend cache purged: $(cat "$body")"
    ;;
  3??)
    fail "REVALIDATE_URL redirects (HTTP $code), so the purge never reached the frontend. Set REVALIDATE_URL=${redirect:-<the redirect target>} in $APP_DIR/.env."
    ;;
  400)
    fail "Purge rejected (400): the frontend did not accept $PAYLOAD: $(head -c 300 "$body")"
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
