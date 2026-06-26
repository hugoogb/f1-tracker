#!/usr/bin/env bash
# Update local database with latest F1 data and push to Neon
# Usage: ./scripts/update-neon.sh [seed.py flags...]
# Examples:
#   ./scripts/update-neon.sh                          # Default race weekend update
#   ./scripts/update-neon.sh --results --standings     # Custom flags
#   ./scripts/update-neon.sh --year-range 2025         # Specific year
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PIPELINE_DIR="$PROJECT_DIR/pipeline"
DOCKER_COMPOSE="$PROJECT_DIR/docker/docker-compose.yml"

# --- Load NEON_DATABASE_URL from .env if not already set ---
if [ -z "${NEON_DATABASE_URL:-}" ] && [ -f "$PROJECT_DIR/.env" ]; then
  # Strip surrounding quotes that some editors add to .env values
  NEON_DATABASE_URL=$(grep '^NEON_DATABASE_URL=' "$PROJECT_DIR/.env" | cut -d'=' -f2- | tr -d '"'"'" || true)
fi

if [ -z "${NEON_DATABASE_URL:-}" ]; then
  echo "Error: NEON_DATABASE_URL not set."
  echo "Add it to .env or export it: export NEON_DATABASE_URL='postgresql://...@...neon.tech/...?sslmode=require'"
  exit 1
fi

if [[ "$NEON_DATABASE_URL" != *"neon.tech"* ]]; then
  echo "Warning: NEON_DATABASE_URL doesn't contain 'neon.tech' — double-check your .env"
  echo "  URL starts with: ${NEON_DATABASE_URL:0:30}..."
fi

# --- Determine seed flags ---
if [ $# -gt 0 ]; then
  SEED_ARGS="$*"
else
  SEED_ARGS="--base --results --qualifying --standings --pitstops --sprints --postprocess --current-year"
fi

# --- Step 1: Ensure Docker PostgreSQL is running ---
echo "==> Checking Docker PostgreSQL..."
if ! docker compose -f "$DOCKER_COMPOSE" ps --status running 2>/dev/null | grep -q db; then
  echo "    Starting Docker PostgreSQL..."
  docker compose -f "$DOCKER_COMPOSE" up -d
fi

echo "    Waiting for PostgreSQL to be ready on localhost:5432..."
# Use docker exec (not host pg_isready) so the script works without a host-side
# PostgreSQL client install — consistent with bootstrap.sh and the other db scripts.
until docker exec docker-db-1 pg_isready -U f1tracker -q 2>/dev/null; do
  sleep 1
done
echo "    PostgreSQL is running."

# --- Step 2: Ensure local schema is migrated ---
# update-neon.sh assumes a populated local DB, but a fresh/recreated Docker volume
# starts empty (no tables) and seed.py does not run migrations itself. Bring the
# schema to head first; this is a no-op when the local DB is already current.
echo "==> Applying Alembic migrations to local database..."
cd "$PIPELINE_DIR"
# No DATABASE_URL override: Alembic falls back to the local URL in alembic.ini
# (same as bootstrap.sh). The Neon override is applied later in Step 5 only.
uv run alembic upgrade head

# --- Step 3: Run seed locally ---
echo "==> Running data ingestion locally..."
echo "    Flags: $SEED_ARGS"
cd "$PIPELINE_DIR"
# shellcheck disable=SC2086
uv run python scripts/seed.py $SEED_ARGS
# Note: seed.py already writes a persistent local backup to docker/backups/
# (timestamped + latest.sql.gz, rotation handled by db-backup.sh) as its final step,
# unless --no-backup is passed. No extra backup call is needed here.

# --- Step 4: Dump full schema + data from local Docker ---
echo "==> Creating full dump from local database..."
FULL_DUMP=$(mktemp)
trap 'rm -f "$FULL_DUMP"' EXIT
docker exec docker-db-1 pg_dump -U f1tracker --no-owner --no-privileges \
  --exclude-table=alembic_version f1tracker | gzip > "$FULL_DUMP"

# --- Step 5: Drop and restore Neon ---
echo "==> Dropping Neon database..."
# Run psql inside the db container (it ships the client and has outbound network),
# so no host-side PostgreSQL client install is required.
docker exec -i docker-db-1 psql "$NEON_DATABASE_URL" --set ON_ERROR_STOP=on -q \
  -c "DROP SCHEMA public CASCADE;" \
  -c "CREATE SCHEMA public;"

# Neon roles default to an empty search_path, which breaks Alembic's unqualified
# `CREATE TABLE alembic_version` (and any unqualified migration DDL). Pin the
# database default to public. This is a database-level GUC, so it survives the
# DROP SCHEMA above and only needs setting once, but re-asserting it is idempotent
# and self-heals a freshly-created Neon branch. (current_database() keeps it generic.)
echo "==> Ensuring search_path=public on Neon..."
docker exec -i docker-db-1 psql "$NEON_DATABASE_URL" --set ON_ERROR_STOP=on -q <<'SQL'
SELECT format('ALTER DATABASE %I SET search_path TO public', current_database()) \gexec
SQL

echo "==> Restoring to Neon..."
gunzip -c "$FULL_DUMP" | docker exec -i docker-db-1 psql "$NEON_DATABASE_URL" --set ON_ERROR_STOP=on --single-transaction -q

# --- Step 6: Stamp Alembic version on Neon ---
# The dump excludes alembic_version, so the restored DB is unversioned. Stamp it
# to head (the local DB was migrated before the dump) so the schema matches the
# recorded revision and `alembic upgrade head` (e.g. in the ingest workflow) is a
# clean no-op instead of trying to recreate existing tables.
echo "==> Stamping Alembic head on Neon..."
cd "$PIPELINE_DIR"
# Use the DIRECT (non-pooler) endpoint: Neon's pooler rejects the search_path
# startup parameter and doesn't reliably apply the database default search_path,
# so Alembic's unqualified DDL fails through it. Stripping "-pooler" from the host
# yields the direct endpoint, which honors the search_path set above. (No-op if the
# URL is already a direct endpoint.)
NEON_DIRECT_URL="${NEON_DATABASE_URL/-pooler/}"
DATABASE_URL="$NEON_DIRECT_URL" uv run alembic stamp head

# --- Step 7: Purge frontend cache (Vercel ISR) ---
# Mirrors the "Purge frontend cache" step in .github/workflows/ingest.yml so a
# MANUAL update busts the Next.js `f1-data` cache tag too. Without this, the fresh
# Neon data stays hidden behind the frontend's cached pages until the 1-day TTL
# (REVALIDATE_SECONDS) lapses. Load the vars from .env if not already exported.
if [ -f "$PROJECT_DIR/.env" ]; then
  if [ -z "${REVALIDATE_URL:-}" ]; then
    REVALIDATE_URL=$(grep '^REVALIDATE_URL=' "$PROJECT_DIR/.env" | cut -d'=' -f2- | tr -d '"'"'" || true)
  fi
  if [ -z "${REVALIDATE_SECRET:-}" ]; then
    REVALIDATE_SECRET=$(grep '^REVALIDATE_SECRET=' "$PROJECT_DIR/.env" | cut -d'=' -f2- | tr -d '"'"'" || true)
  fi
fi

echo "==> Purging frontend cache..."
if [ -z "${REVALIDATE_URL:-}" ]; then
  echo "    REVALIDATE_URL not set — skipping cache purge."
  echo "    (Set REVALIDATE_URL in .env to auto-purge the Vercel cache; the 1-day TTL backstops otherwise.)"
# Non-blocking: data is already in Neon, so a failed purge must not fail the run;
# the 1-day TTL backstops it. An `if` condition is exempt from `set -e`.
elif curl -fsS --max-time 30 -X POST "$REVALIDATE_URL" \
       -H "Authorization: Bearer ${REVALIDATE_SECRET:-}"; then
  echo ""
  echo "    Cache purged (f1-data tag)."
else
  echo ""
  echo "    Warning: cache purge failed — data is live in Neon; the 1-day TTL will refresh the frontend."
fi

echo ""
echo "==> Done! Neon database updated successfully."
