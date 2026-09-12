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

# --- Step 2: Install Python dependencies ---
echo "==> Installing Python dependencies..."
cd "$PIPELINE_DIR"
uv sync --extra dev

# --- Step 3: Restore the bundled backup (fast path) ---
# Migrations are db-restore.sh's business, not this script's: the bundled dump
# is a full one, carrying the schema and its own Alembic stamp, so it has to be
# loaded *before* `alembic upgrade head` rather than after. Running them here
# would only be undone by the restore.
BACKUP_FILE="$PROJECT_DIR/docker/backups/latest.sql.gz"
if [ -f "$BACKUP_FILE" ]; then
  echo "==> Restoring from the bundled backup..."
  # The database is empty on a fresh volume, so there is nothing to confirm.
  FORCE=1 "$SCRIPT_DIR/db-restore.sh"
else
  echo "==> No backup found at docker/backups/latest.sql.gz."
  echo "==> Running database migrations..."
  uv run alembic upgrade head
  echo "    Run the full ingestion to fill it (slow — downloads the f1db release):"
  echo "      cd pipeline && uv run python scripts/seed.py --base --layouts --colors --results --qualifying --sprints --standings --pitstops --postprocess"
fi

# --- Step 4: Install frontend deps ---
echo "==> Installing frontend dependencies..."
cd "$PROJECT_DIR"
pnpm install --frozen-lockfile

echo ""
echo "==> Bootstrap complete. Start the app with:"
echo "    Backend : cd pipeline && uv run uvicorn src.api.main:app --reload"
echo "    Frontend: pnpm dev"
