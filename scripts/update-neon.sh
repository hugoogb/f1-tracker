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
until pg_isready -h localhost -p 5432 -U f1tracker -q 2>/dev/null; do
  sleep 1
done
echo "    PostgreSQL is running."

# --- Step 2: Run seed locally ---
echo "==> Running data ingestion locally..."
echo "    Flags: $SEED_ARGS"
cd "$PIPELINE_DIR"
# shellcheck disable=SC2086
uv run python scripts/seed.py $SEED_ARGS

# --- Step 3: Dump full schema + data from local Docker ---
echo "==> Creating full dump from local database..."
FULL_DUMP=$(mktemp)
trap 'rm -f "$FULL_DUMP"' EXIT
docker exec docker-db-1 pg_dump -U f1tracker --no-owner --no-privileges \
  --exclude-table=alembic_version f1tracker | gzip > "$FULL_DUMP"

# --- Step 4: Drop and restore Neon ---
echo "==> Dropping Neon database..."
psql "$NEON_DATABASE_URL" --set ON_ERROR_STOP=on -q \
  -c "DROP SCHEMA public CASCADE;" \
  -c "CREATE SCHEMA public;"

echo "==> Restoring to Neon..."
gunzip -c "$FULL_DUMP" | psql "$NEON_DATABASE_URL" --set ON_ERROR_STOP=on --single-transaction -q

echo ""
echo "==> Done! Neon database updated successfully."
