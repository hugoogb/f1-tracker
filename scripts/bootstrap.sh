#!/usr/bin/env bash
# One-command local setup: env file, database, migrations, and seed data.
# After this finishes, start the backend and frontend (commands printed at the end).
#
# Usage: ./scripts/bootstrap.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# --- Step 0: Ensure .env exists (before sourcing lib/db.sh, which reads it) ---
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
if [ ! -f "$PROJECT_DIR/.env" ]; then
  echo "==> Creating .env from .env.example..."
  cp "$PROJECT_DIR/.env.example" "$PROJECT_DIR/.env"
fi

# shellcheck source=lib/db.sh
. "$SCRIPT_DIR/lib/db.sh"

PIPELINE_DIR="$PROJECT_DIR/pipeline"
DOCKER_COMPOSE="$COMPOSE_FILE"

# --- Step 1: Start PostgreSQL ---
echo "==> Starting Docker PostgreSQL..."
docker compose -f "$DOCKER_COMPOSE" up -d

db_wait_ready 60

# --- Step 2: Run migrations ---
echo "==> Running database migrations..."
cd "$PIPELINE_DIR"
uv sync --extra dev
uv run alembic upgrade head

# --- Step 3: Restore data from the bundled backup (fast path) ---
BACKUP_FILE="$PROJECT_DIR/docker/backups/latest.sql.gz"
if [ -f "$BACKUP_FILE" ]; then
  echo "==> Restoring data from latest backup..."
  # Bootstrap already migrated the schema above, and the DB is empty on a fresh
  # volume, so there is nothing to confirm.
  FORCE=1 SKIP_MIGRATE=1 "$SCRIPT_DIR/db-restore.sh"
else
  echo "==> No backup found at docker/backups/latest.sql.gz."
  echo "    Run the full ingestion instead (slow — fetches from Fast-F1/Jolpica):"
  echo "      cd pipeline && uv run python scripts/seed.py --base --results --qualifying --standings --pitstops --sprints --postprocess"
fi

# --- Step 4: Install frontend deps ---
echo "==> Installing frontend dependencies..."
cd "$PROJECT_DIR"
pnpm install --frozen-lockfile

echo ""
echo "==> Bootstrap complete. Start the app with:"
echo "    Backend : cd pipeline && uv run uvicorn src.api.main:app --reload"
echo "    Frontend: pnpm dev"
