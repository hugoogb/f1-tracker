#!/usr/bin/env bash
# Restore PostgreSQL data from a backup file.
#
# Usage: ./scripts/db-restore.sh [backup_file]
# If no file is provided, restores from the latest backup.
#
# Env:
#   DB_CONTAINER  target container (default: ${STACK_NAME:-f1-tracker}-db)
#   FORCE=1       skip the interactive confirmation (for scripted/VPS use)
#   SKIP_MIGRATE=1  don't run `alembic upgrade head` first (the VPS stack has a
#                   dedicated `migrate` service, and uv isn't installed there)
set -euo pipefail

# shellcheck source=lib/db.sh
. "$(cd "$(dirname "$0")" && pwd)/lib/db.sh"

BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/docker/backups}"
BACKUP_FILE="${1:-${BACKUP_DIR}/latest.sql.gz}"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: Backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

db_require_container

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

# Bring the schema up to date first, unless the caller handles migrations.
if [ "${SKIP_MIGRATE:-0}" != "1" ]; then
  echo "Ensuring schema is up to date..."
  (cd "$PROJECT_DIR/pipeline" && uv run alembic upgrade head)
fi

# Clear alembic_version to avoid conflict with backup data
db_psql -c "DELETE FROM alembic_version"

# Restore data
echo "Restoring data..."
gunzip -c "$BACKUP_FILE" | db_psql --single-transaction

echo "Restore complete."
