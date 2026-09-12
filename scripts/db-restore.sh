#!/usr/bin/env bash
# Restore a PostgreSQL backup.
#
# Usage: ./scripts/db-restore.sh [backup_file]
# If no file is provided, restores docker/backups/latest.sql.gz.
#
# Handles both dump flavours, because which one you have decides the order of
# operations:
#
#   full        (what db-backup.sh writes now) — schema, data, the Alembic
#               stamp and the materialized views are all in the file. It is
#               loaded first and Alembic runs afterwards, to carry a dump older
#               than the current head up to it.
#   data-only   (what this repo used to write) — the schema has to be migrated
#               into place first, and the materialized views rebuilt afterwards,
#               since a data-only dump carries neither.
#
# Env:
#   DB_CONTAINER    target container (default: ${STACK_NAME:-f1-tracker}-db)
#   FORCE=1         skip the interactive confirmation (for scripted/VPS use)
#   SKIP_MIGRATE=1  don't run `alembic upgrade head` (the VPS stack has a
#                   dedicated `migrate` service, and uv isn't installed there)
#   SKIP_VIEWS=1    don't rebuild the materialized views
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

# Checked before anything is dropped: a corrupt archive should fail while the
# current data is still there, not halfway through replacing it.
dump_verify_gzip "$BACKUP_FILE"

if dump_is_full "$BACKUP_FILE"; then
  FLAVOUR="full"
else
  FLAVOUR="data-only"
fi

echo "Restoring from: $BACKUP_FILE ($FLAVOUR dump)"
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

load_dump() {
  # ON_ERROR_STOP so a failed statement fails the restore. Without it psql
  # reports success having skipped whatever did not apply, which is the one
  # thing a restore must never do. --single-transaction makes it all-or-nothing:
  # DDL is transactional in PostgreSQL, so a full dump either lands completely
  # or leaves the database as it was.
  gunzip -c "$BACKUP_FILE" | db_psql --single-transaction -v ON_ERROR_STOP=1 -q
}

if [ "$FLAVOUR" = "full" ]; then
  # The dump drops and recreates every object it owns (--clean --if-exists), so
  # it does not care what is in the database already, and it carries its own
  # alembic_version — which is why Alembic runs after it rather than before.
  echo "Restoring schema, data and materialized views..."
  load_dump

  # A no-op when the dump is current. It matters when restoring an older backup
  # into a checkout that has since gained migrations.
  run_migrations

  # The dump already refreshed the views (pg_dump emits REFRESH MATERIALIZED
  # VIEW for every populated one), so this only has work to do when the
  # migrations above changed something underneath them.
  if [ "${SKIP_VIEWS:-0}" != "1" ]; then
    echo "Rebuilding materialized views..."
    (cd "$PROJECT_DIR/pipeline" && uv run python scripts/refresh_views.py)
  fi
else
  # Legacy path: the schema has to exist before the data can go into it.
  run_migrations

  # The dump is --data-only and excludes alembic_version, so the stamp written
  # by the migration step above is left alone deliberately: clearing it would
  # leave the schema unstamped and make the next `alembic upgrade head` try to
  # replay every migration from scratch.
  echo "Restoring data..."
  load_dump

  # The computed stats views (driver_career_stats, constructor_career_stats,
  # season_champions) are materialized views created by the ingest, not by
  # Alembic, and pg_dump --data-only does not carry their contents. Without this
  # step a restored database has no career stats, records or champions at all.
  echo "Rebuilding materialized views..."
  if [ "${SKIP_VIEWS:-0}" != "1" ]; then
    (cd "$PROJECT_DIR/pipeline" && uv run python scripts/refresh_views.py)
  else
    echo "SKIP_VIEWS=1 set - skipping. Run scripts/refresh_views.py yourself,"
    echo "or seed.py --postprocess, or the API will serve empty career stats."
  fi
fi

echo ""
echo "Restored:"
dump_row_counts "$BACKUP_FILE"
echo ""
echo "Restore complete."
