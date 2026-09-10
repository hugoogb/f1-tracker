#!/usr/bin/env bash
# Shared setup for the VPS scripts. Source it, don't execute it.
#
# Defaults assume the repo is checked out on the VPS (e.g. /opt/f1-tracker) with
# the production env file at <repo>/.env.prod. Override with ENV_FILE.

_VPS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_REPO_DIR="$(dirname "$(dirname "$_VPS_DIR")")"

# lib/db.sh reads these, so set them before sourcing it.
export ENV_FILE="${ENV_FILE:-$_REPO_DIR/.env.prod}"
export COMPOSE_FILE="${COMPOSE_FILE:-$_REPO_DIR/docker/compose.prod.yml}"

# shellcheck source=../lib/db.sh
. "$_REPO_DIR/scripts/lib/db.sh"

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: env file not found: $ENV_FILE" >&2
  echo "  Copy docker/.env.prod.example to $ENV_FILE and fill it in." >&2
  exit 1
fi

# Set TRAEFIK=1 (or COMPOSE_OVERRIDE=<file>) when the API is published through a
# containerised Traefik rather than a host reverse proxy.
COMPOSE_OVERRIDE="${COMPOSE_OVERRIDE:-}"
if [ "${TRAEFIK:-0}" = "1" ] && [ -z "$COMPOSE_OVERRIDE" ]; then
  COMPOSE_OVERRIDE="$_REPO_DIR/docker/compose.traefik.yml"
fi

# `dc` is the one blessed way to talk to this stack — it always carries the env
# file and the right compose files, so it can never touch another VPS project.
dc() {
  if [ -n "$COMPOSE_OVERRIDE" ]; then
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" -f "$COMPOSE_OVERRIDE" "$@"
  else
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
  fi
}

# Bearer-token cache purge against the Next.js /api/revalidate route on Vercel.
# Non-fatal: data is already live, and the frontend's TTL backstops a failure.
purge_frontend_cache() {
  local url secret
  url="${REVALIDATE_URL:-$(env_get REVALIDATE_URL)}"
  secret="${REVALIDATE_SECRET:-$(env_get REVALIDATE_SECRET)}"

  if [ -z "$url" ]; then
    echo "    REVALIDATE_URL not set — skipping frontend cache purge."
    return 0
  fi
  if curl -fsS --max-time 30 -X POST "$url" -H "Authorization: Bearer ${secret}"; then
    echo ""
    echo "    Frontend cache purged (f1-data tag)."
  else
    echo ""
    echo "    Warning: cache purge failed — data is live; the TTL will refresh the frontend."
  fi
}
