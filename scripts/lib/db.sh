#!/usr/bin/env bash
# shellcheck disable=SC2034  # these are consumed by the sourcing script

_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$_LIB_DIR")")"
ENV_FILE="${ENV_FILE:-$PROJECT_DIR/.env}"
# shellcheck source=env.sh
. "$_LIB_DIR/env.sh"

STACK_NAME="${STACK_NAME:-$(env_get STACK_NAME)}"
STACK_NAME="${STACK_NAME:-f1-tracker}"

DB_CONTAINER="${DB_CONTAINER:-$(env_get DB_CONTAINER)}"
DB_CONTAINER="${DB_CONTAINER:-${STACK_NAME}-db}"

POSTGRES_USER="${POSTGRES_USER:-$(env_get POSTGRES_USER)}"
POSTGRES_USER="${POSTGRES_USER:-f1tracker}"

POSTGRES_DB="${POSTGRES_DB:-$(env_get POSTGRES_DB)}"
POSTGRES_DB="${POSTGRES_DB:-f1tracker}"

COMPOSE_FILE="${COMPOSE_FILE:-$PROJECT_DIR/docker/docker-compose.yml}"

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

dump_is_full() {
  local matches
  matches="$(gunzip -c "$1" | grep -c '^CREATE TABLE ' || true)"
  [ "${matches:-0}" -gt 0 ]
}

dump_verify_gzip() {
  if ! gzip -t "$1" 2>/dev/null; then
    echo "Error: $1 is not a valid gzip archive (truncated or corrupt)." >&2
    return 1
  fi
}

dump_row_counts() {
  gunzip -c "$1" | awk -F'\t' '
    /^COPY public\.[a-z_]+ \(/ {
      split($0, head, " ")
      table = head[2]; sub(/^public\./, "", table)
      rows = 0; sectors = 0; qidx = 0
      if (table == "qualifying_results") {
        cols = $0
        sub(/^[^(]*\(/, "", cols); sub(/\).*$/, "", cols)
        n = split(cols, col, ", ")
        for (i = 1; i <= n; i++) if (col[i] == "q1_s1_ms") qidx = i
      }
      copying = 1
      next
    }
    copying && $0 == "\\." {
      line = sprintf("  %-22s %8d rows", table, rows)
      if (qidx) line = line sprintf("  (%d with Fast-F1 sector times)", sectors)
      print line
      copying = 0
      next
    }
    copying {
      rows++
      if (qidx && $qidx != "\\N") sectors++
    }
  '
}

SEED_REPO="${SEED_REPO:-hugoogb/f1-tracker}"
SEED_TAG="${SEED_TAG:-seed}"
SEED_ASSET="${SEED_ASSET:-latest.sql.gz}"
SEED_URL="${SEED_URL:-https://github.com/${SEED_REPO}/releases/download/${SEED_TAG}/${SEED_ASSET}}"

human_size() {
  ls -l "$1" | awk '{
    if ($5 >= 1048576) printf "%.1f MB", $5 / 1048576
    else printf "%.1f KB", $5 / 1024
  }'
}

seed_release_notes() {
  local file="$1"
  cat <<EOF
Complete PostgreSQL dump used by \`scripts/bootstrap.sh\`. Not tracked in git —
fetch it with \`./scripts/seed-fetch.sh\`, replace it with
\`./scripts/db-backup.sh --remote --publish\`.

Taken from production on $(date -u +%Y-%m-%d) ($(human_size "$file") gzipped).

\`\`\`
$(dump_row_counts "$file")
\`\`\`

Data: f1db (CC BY 4.0) and Fast-F1 (MIT). See ATTRIBUTIONS.md.
EOF
}
