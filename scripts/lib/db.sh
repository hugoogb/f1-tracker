#!/usr/bin/env bash
# Shared PostgreSQL/container settings for the scripts in this repo.
# Source it, don't execute it:  . "$(dirname "$0")/lib/db.sh"
#
# Everything is overridable by environment variable or by a key in the repo-root
# .env, so the same scripts drive the local dev database and the VPS stack:
#
#   local  : STACK_NAME=f1-tracker            → container f1-tracker-db
#   VPS    : STACK_NAME=f1-tracker            → container f1-tracker-db
#   staging: STACK_NAME=f1-tracker-staging    → container f1-tracker-staging-db

# shellcheck disable=SC2034  # these are consumed by the sourcing script

_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$_LIB_DIR")")"
ENV_FILE="${ENV_FILE:-$PROJECT_DIR/.env}"

# Read a single key out of the env file without sourcing it — values may contain
# characters (#, spaces, quotes) that a plain `source` would mangle or execute.
env_get() {
  local key="$1"
  [ -f "$ENV_FILE" ] || return 0
  grep -E "^${key}=" "$ENV_FILE" | tail -n1 | cut -d'=' -f2- | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"
}

STACK_NAME="${STACK_NAME:-$(env_get STACK_NAME)}"
STACK_NAME="${STACK_NAME:-f1-tracker}"

DB_CONTAINER="${DB_CONTAINER:-$(env_get DB_CONTAINER)}"
DB_CONTAINER="${DB_CONTAINER:-${STACK_NAME}-db}"

POSTGRES_USER="${POSTGRES_USER:-$(env_get POSTGRES_USER)}"
POSTGRES_USER="${POSTGRES_USER:-f1tracker}"

POSTGRES_DB="${POSTGRES_DB:-$(env_get POSTGRES_DB)}"
POSTGRES_DB="${POSTGRES_DB:-f1tracker}"

# Compose file to fall back on when the database container isn't running.
# Point it at docker/compose.prod.yml on the VPS.
COMPOSE_FILE="${COMPOSE_FILE:-$PROJECT_DIR/docker/docker-compose.yml}"

# --- Helpers -----------------------------------------------------------------

db_exec() { docker exec "$DB_CONTAINER" "$@"; }
db_exec_i() { docker exec -i "$DB_CONTAINER" "$@"; }
db_psql() { db_exec_i psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"; }

db_container_running() {
  [ -n "$(docker ps -q --filter "name=^/${DB_CONTAINER}$" 2>/dev/null)" ]
}

db_require_container() {
  if ! db_container_running; then
    echo "Error: database container '$DB_CONTAINER' is not running." >&2
    echo "  Start it with: docker compose -f $COMPOSE_FILE up -d" >&2
    echo "  Or point the scripts at another one: DB_CONTAINER=<name> $0" >&2
    exit 1
  fi
}

db_wait_ready() {
  local timeout="${1:-60}"
  local waited=0
  echo "    Waiting for PostgreSQL in '$DB_CONTAINER'..."
  until db_exec pg_isready -U "$POSTGRES_USER" -q 2>/dev/null; do
    if [ "$waited" -ge "$timeout" ]; then
      echo "Error: PostgreSQL not ready after ${timeout}s." >&2
      exit 1
    fi
    sleep 1
    waited=$((waited + 1))
  done
  echo "    PostgreSQL is ready."
}
