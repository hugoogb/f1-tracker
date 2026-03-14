#!/usr/bin/env bash
# Create a PostgreSQL data backup (data only — schema managed by Alembic)
set -euo pipefail

BACKUP_DIR="$(cd "$(dirname "$0")/../docker/backups" && pwd)"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/f1tracker_${TIMESTAMP}.sql.gz"
LATEST_COPY="${BACKUP_DIR}/latest.sql.gz"

echo "Backing up f1tracker database..."
docker exec docker-db-1 pg_dump -U f1tracker --data-only --no-owner --no-privileges f1tracker \
  | gzip > "$BACKUP_FILE"

# Copy as latest (real file so git can track it)
cp "$BACKUP_FILE" "$LATEST_COPY"

SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "Backup saved: $BACKUP_FILE ($SIZE)"

# Rotate old backups — keep only the last 5
KEEP_LAST=5
cd "$BACKUP_DIR"
# shellcheck disable=SC2012
ls -t f1tracker_*.sql.gz 2>/dev/null | tail -n +$((KEEP_LAST + 1)) | xargs -r rm --
REMAINING=$(ls f1tracker_*.sql.gz 2>/dev/null | wc -l)
echo "Backup rotation: keeping $REMAINING backups"
