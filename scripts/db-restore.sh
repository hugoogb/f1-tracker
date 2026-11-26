#!/usr/bin/env bash
set -euo pipefail

trap 'status=$?; echo "Error: $(basename "$0") failed at line $LINENO (exit $status)." >&2' ERR

# shellcheck source=lib/db.sh
. "$(cd "$(dirname "$0")" && pwd)/lib/db.sh"

BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/docker/backups}"
BACKUP_FILE="${1:-${BACKUP_DIR}/latest.sql.gz}"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: Backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

db_require_container

dump_verify_gzip "$BACKUP_FILE"

if ! dump_is_full "$BACKUP_FILE"; then
  echo "Error: $BACKUP_FILE carries no schema. Only full dumps (db-backup.sh)" >&2
  echo "       restore; the old data-only format is no longer supported." >&2
  exit 1
fi

echo "Restoring from: $BACKUP_FILE"
echo "Target:         $DB_CONTAINER / $POSTGRES_DB"
if [ "${FORCE:-0}" != "1" ]; then
  echo "WARNING: This will overwrite current data. Press Ctrl+C to cancel."
  read -r -p "Continue? [y/N] " confirm
  if [[ ! "$confirm" =~ ^[yY]$ ]]; then
    echo "Cancelled."
    exit 0
  fi
fi

run_migrations() {
  if [ "${SKIP_MIGRATE:-0}" = "1" ]; then
    return
  fi
  echo "Ensuring schema is up to date..."
  (cd "$PROJECT_DIR/pipeline" && uv run alembic upgrade head)
}

schema_reset_sql() {
  if [ "${SKIP_SCHEMA_RESET:-0}" = "1" ]; then
    return
  fi
  printf 'DROP SCHEMA IF EXISTS public CASCADE;\nCREATE SCHEMA public;\n'
}

load_dump() {
  local reset
  reset="$(schema_reset_sql)"
  { [ -n "$reset" ] && printf '%s' "$reset"; gunzip -c "$BACKUP_FILE"; } \
    | db_psql --single-transaction -v ON_ERROR_STOP=1 -q
}

echo "Restoring schema, data and materialized views..."
load_dump

run_migrations

if [ "${SKIP_VIEWS:-0}" != "1" ]; then
  echo "Rebuilding materialized views..."
  (cd "$PROJECT_DIR/pipeline" && uv run python scripts/refresh_views.py)
fi

echo ""
echo "Restored:"
dump_row_counts "$BACKUP_FILE"
echo ""
echo "Restore complete."
