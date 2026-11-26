#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
if [ ! -f "$PROJECT_DIR/.env" ]; then
  echo "==> Creating .env from .env.example..."
  cp "$PROJECT_DIR/.env.example" "$PROJECT_DIR/.env"
fi

# shellcheck source=lib/db.sh
. "$SCRIPT_DIR/lib/db.sh"

PIPELINE_DIR="$PROJECT_DIR/pipeline"
DOCKER_COMPOSE="$COMPOSE_FILE"

echo "==> Starting Docker PostgreSQL..."
docker compose -f "$DOCKER_COMPOSE" up -d

db_wait_ready 60

echo "==> Installing Python dependencies..."
cd "$PIPELINE_DIR"
uv sync --extra dev

BACKUP_FILE="$PROJECT_DIR/docker/backups/latest.sql.gz"

if [ ! -f "$BACKUP_FILE" ]; then
  "$SCRIPT_DIR/seed-fetch.sh" || true
fi

if [ -f "$BACKUP_FILE" ]; then
  echo "==> Restoring from the seed dump..."
  FORCE=1 "$SCRIPT_DIR/db-restore.sh"
else
  echo "==> No seed dump available — starting from an empty database."
  echo "==> Running database migrations..."
  uv run alembic upgrade head
  echo "    Run the full ingestion to fill it (slow — downloads the f1db release):"
  echo "      cd pipeline && uv run python scripts/seed.py --base --layouts --colors --lineages --results --qualifying --sprints --standings --pitstops --postprocess"
  echo "    Lap times and qualifying sectors need Fast-F1 on top: pnpm fastf1"
fi

echo "==> Installing frontend dependencies..."
cd "$PROJECT_DIR"
pnpm install --frozen-lockfile

echo ""
echo "==> Bootstrap complete. Start the app with:"
echo "    Backend : cd pipeline && uv run uvicorn src.api.main:app --reload"
echo "    Frontend: pnpm dev"
