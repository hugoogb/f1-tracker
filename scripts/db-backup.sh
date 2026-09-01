#!/usr/bin/env bash
# Create a PostgreSQL data backup (data only — schema managed by Alembic).
#
# Works against any F1 Tracker database container; override the target with
# DB_CONTAINER (or STACK_NAME). On the VPS this is what the
# f1-tracker-backup.timer systemd unit runs.
#
# Usage: ./scripts/db-backup.sh
set -euo pipefail

# shellcheck source=lib/db.sh
. "$(cd "$(dirname "$0")" && pwd)/lib/db.sh"

BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/docker/backups}"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/f1tracker_${TIMESTAMP}.sql.gz"
LATEST_COPY="${BACKUP_DIR}/latest.sql.gz"

db_require_container

echo "Backing up $POSTGRES_DB from container $DB_CONTAINER..."
db_exec pg_dump -U "$POSTGRES_USER" --data-only --no-owner --no-privileges \
  --exclude-table=alembic_version "$POSTGRES_DB" \
  | gzip > "$BACKUP_FILE"

# Copy as latest (real file so git can track it)
cp "$BACKUP_FILE" "$LATEST_COPY"

SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "Backup saved: $BACKUP_FILE ($SIZE)"

# Rotate old backups — keep only the last N
KEEP_LAST="${BACKUP_KEEP_LAST:-5}"
cd "$BACKUP_DIR"
# shellcheck disable=SC2012
ls -t f1tracker_*.sql.gz 2>/dev/null | tail -n +$((KEEP_LAST + 1)) | xargs -r rm --
REMAINING=$(ls f1tracker_*.sql.gz 2>/dev/null | wc -l)
echo "Backup rotation: keeping $REMAINING backups"
