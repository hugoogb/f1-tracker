#!/usr/bin/env bash
# ONE-TIME: copy the F1 dataset out of Neon and into the VPS PostgreSQL container.
#
# Run this on the VPS, after `deploy.sh` has brought the stack up (so the schema
# is already at Alembic head). It dumps data only — the schema belongs to
# Alembic, exactly like scripts/db-backup.sh.
#
# Usage:
#   NEON_DATABASE_URL='postgresql://...neon.tech/f1tracker?sslmode=require' \
#     ./scripts/vps/migrate-from-neon.sh
#
#   ./scripts/vps/migrate-from-neon.sh /path/to/dump.sql.gz   # restore an existing dump
#
# Env:
#   PG_CLIENT_IMAGE  image providing pg_dump (default postgres:17-alpine — a
#                    newer client than the server is the safe direction, and Neon
#                    may already be on 17)
#   KEEP_DUMP=1      keep the intermediate dump file
set -euo pipefail

# shellcheck source=_common.sh
. "$(cd "$(dirname "$0")" && pwd)/_common.sh"

DUMP_FILE="${1:-}"
PG_CLIENT_IMAGE="${PG_CLIENT_IMAGE:-postgres:17-alpine}"
WORK_DIR="${WORK_DIR:-/var/backups/f1-tracker}"

db_require_container

if [ -z "$DUMP_FILE" ]; then
  NEON_DATABASE_URL="${NEON_DATABASE_URL:-$(env_get NEON_DATABASE_URL)}"
  if [ -z "$NEON_DATABASE_URL" ]; then
    echo "Error: NEON_DATABASE_URL not set and no dump file given." >&2
    echo "  Either export NEON_DATABASE_URL, or pass a .sql.gz dump as \$1." >&2
    exit 1
  fi

  mkdir -p "$WORK_DIR"
  DUMP_FILE="$WORK_DIR/neon-migration-$(date +%Y%m%d_%H%M%S).sql.gz"

  echo "==> Dumping data from Neon (this takes a few minutes)..."
  # A throwaway client container keeps the VPS free of host-side psql packages.
  docker run --rm -i "$PG_CLIENT_IMAGE" \
    pg_dump "$NEON_DATABASE_URL" --data-only --no-owner --no-privileges \
    --exclude-table=alembic_version \
    | gzip > "$DUMP_FILE"

  echo "    Dump written: $DUMP_FILE ($(du -h "$DUMP_FILE" | cut -f1))"
fi

if [ ! -s "$DUMP_FILE" ]; then
  echo "Error: dump file is missing or empty: $DUMP_FILE" >&2
  exit 1
fi

echo "==> Restoring into $DB_CONTAINER / $POSTGRES_DB..."
# SKIP_MIGRATE: the stack's `migrate` service already brought the schema to head,
# and uv/Python aren't installed on the VPS host.
FORCE=1 SKIP_MIGRATE=1 "$PROJECT_DIR/scripts/db-restore.sh" "$DUMP_FILE"

echo "==> Stamping Alembic head..."
# The dump excludes alembic_version, and db-restore.sh clears it, so re-record the
# current revision. `exec` (not `run`) — the API container is already up and holds
# both Alembic and the migration scripts.
dc exec -T api alembic stamp head

echo "==> Verifying row counts..."
dc exec -T api curl -fsS http://127.0.0.1:8000/api/stats || {
  echo "    (API not up yet — run scripts/vps/deploy.sh and check /api/stats.)"
}
echo ""

if [ "${KEEP_DUMP:-0}" != "1" ] && [ -z "${1:-}" ]; then
  echo "==> Removing intermediate dump ($DUMP_FILE). Set KEEP_DUMP=1 to keep it."
  rm -f "$DUMP_FILE"
fi

echo ""
echo "==> Migration complete. Next steps:"
echo "    1. Point NEXT_PUBLIC_API_URL on Vercel at the VPS API and redeploy."
echo "    2. Confirm the site works, then decommission the Neon project and the Render service."
