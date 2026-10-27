#!/usr/bin/env bash
# Expire the frontend's cached pages through the Next.js /api/revalidate route
# on Vercel, after the data under them changed. Runs INSIDE the `job` container
# (docker/compose.prod.yml), which gets REVALIDATE_URL and REVALIDATE_SECRET
# from the server's .env -- never on the host.
#
#   bash scripts/purge_cache.sh [--all | --latest | --years 2025,2026]
#
# Reached from outside as a task:
#   vps_task job bash scripts/purge_cache.sh --latest     (scripts/lib/vps.sh)
#
# --all is the default and the one to use after a historical backfill or an
# f1db correction. --latest expires the newest season plus the global lists,
# which is all a weekly ingest changes. --years expires those seasons only.
#
# Exits 1 and prints a GitHub `::warning::` when the purge does not land, so a
# missing or mismatched secret shows up as an annotation on the Actions run
# rather than as pages that quietly stay a day behind.
set -uo pipefail

SCOPE=all
YEARS=""
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

fail() {
  echo "    $1"
  echo "::warning title=Frontend cache not purged::$1"
  exit 1
}

echo "==> Purging frontend cache ($SCOPE${YEARS:+: $YEARS})..."
[ -n "${REVALIDATE_URL:-}" ] \
  || fail "REVALIDATE_URL is not set in /srv/apps/f1_api/.env, so cached pages keep the old data for up to a day."
[ -n "${REVALIDATE_SECRET:-}" ] \
  || fail "REVALIDATE_SECRET is not set in /srv/apps/f1_api/.env, so the frontend will refuse the purge."

body="$(mktemp)"
# The secret goes through a header file, not curl's command line.
hdr="$(mktemp)"
trap 'rm -f "$body" "$hdr"' EXIT
printf 'Authorization: Bearer %s\nContent-Type: application/json\n' "$REVALIDATE_SECRET" > "$hdr"
out="$(curl -sS --max-time 30 -o "$body" -w '%{http_code} %{redirect_url}' -X POST "$REVALIDATE_URL" \
          -H "@$hdr" --data "$PAYLOAD")" || out="000"
code="${out%% *}"
redirect="${out#* }"

case "$code" in
  200) echo "    Frontend cache purged: $(cat "$body")" ;;
  3??) fail "REVALIDATE_URL redirects (HTTP $code), so the purge never reached the frontend. Set REVALIDATE_URL=${redirect:-<the redirect target>} in /srv/apps/f1_api/.env." ;;
  400) fail "Purge rejected (400): the frontend did not accept $PAYLOAD: $(head -c 300 "$body")" ;;
  401) fail "Purge rejected (401): REVALIDATE_SECRET in /srv/apps/f1_api/.env does not match the Vercel project's REVALIDATE_SECRET." ;;
  000) fail "Could not reach $REVALIDATE_URL (network error or timeout)." ;;
  *)   fail "Purge failed with HTTP $code from $REVALIDATE_URL: $(head -c 300 "$body")" ;;
esac
