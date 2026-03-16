#!/usr/bin/env bash
# Restore PostgreSQL data from a backup file
# Usage: ./scripts/db-restore.sh [backup_file]
# If no file is provided, restores from the latest backup
set -euo pipefail

BACKUP_DIR="$(cd "$(dirname "$0")/../docker/backups" && pwd)"
BACKUP_FILE="${1:-${BACKUP_DIR}/latest.sql.gz}"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "Restoring from: $BACKUP_FILE"
echo "WARNING: This will overwrite current data. Press Ctrl+C to cancel."
read -r -p "Continue? [y/N] " confirm
if [[ ! "$confirm" =~ ^[yY]$ ]]; then
  echo "Cancelled."
  exit 0
fi

# Run Alembic migration first to ensure schema is up to date
echo "Ensuring schema is up to date..."
cd "$(dirname "$0")/../pipeline" && uv run alembic upgrade head

# Clear alembic_version to avoid conflict with backup data
docker exec docker-db-1 psql -U f1tracker -d f1tracker -c "DELETE FROM alembic_version"

# Restore data
echo "Restoring data..."
gunzip -c "$BACKUP_FILE" | docker exec -i docker-db-1 psql -U f1tracker -d f1tracker --single-transaction

echo "Restore complete."
