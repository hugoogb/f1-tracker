#!/usr/bin/env bash
# Back up the VPS database.
#
# Thin wrapper over scripts/db-backup.sh that targets the production container
# and writes OUTSIDE the git checkout — docker/backups/latest.sql.gz is tracked
# in git, and writing there on the VPS would make `git pull --ff-only` fail.
#
# Usage: ./scripts/vps/backup.sh
# Env:   BACKUP_DIR (default /var/backups/f1-tracker), BACKUP_KEEP_LAST (default 14)
set -euo pipefail

# shellcheck source=_common.sh
. "$(cd "$(dirname "$0")" && pwd)/_common.sh"

export BACKUP_DIR="${BACKUP_DIR:-/var/backups/f1-tracker}"
export BACKUP_KEEP_LAST="${BACKUP_KEEP_LAST:-14}"
export DB_CONTAINER POSTGRES_USER POSTGRES_DB

mkdir -p "$BACKUP_DIR"
exec "$PROJECT_DIR/scripts/db-backup.sh"
