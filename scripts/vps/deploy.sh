#!/usr/bin/env bash
# Build and (re)start the F1 Tracker backend stack on the VPS.
#
# Usage:
#   ./scripts/vps/deploy.sh              # build + up + verify
#   ./scripts/vps/deploy.sh --pull       # git pull --ff-only first
#   TRAEFIK=1 ./scripts/vps/deploy.sh    # publish through containerised Traefik
#
# Only ever touches this project's containers: every compose call goes through
# `dc`, which pins the project name and compose files.
set -euo pipefail

# shellcheck source=_common.sh
. "$(cd "$(dirname "$0")" && pwd)/_common.sh"

GIT_PULL=0
for arg in "$@"; do
  case "$arg" in
    --pull) GIT_PULL=1 ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done

if [ "$GIT_PULL" = "1" ]; then
  echo "==> Updating source..."
  git -C "$PROJECT_DIR" pull --ff-only
fi

echo "==> Building images ($STACK_NAME)..."
dc build

# `up` runs the one-shot `migrate` service to completion before starting the API
# (see depends_on in compose.prod.yml), so schema changes land automatically.
echo "==> Starting stack..."
dc up -d --remove-orphans

db_wait_ready 90

echo "==> Waiting for the API to report ready..."
READY=0
for _ in $(seq 1 30); do
  # Query the container directly so this works with either proxy topology.
  if dc exec -T api curl -fsS http://127.0.0.1:8000/api/health/db >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 2
done

if [ "$READY" != "1" ]; then
  echo "Error: API did not become ready. Recent logs:" >&2
  dc logs --tail 50 api >&2
  exit 1
fi

echo "    API is ready (database reachable)."
dc exec -T api curl -fsS http://127.0.0.1:8000/api/stats || true
echo ""

echo "==> Pruning dangling images for this project..."
docker image prune -f --filter "label=org.opencontainers.image.title=f1-tracker-api" >/dev/null || true

echo ""
echo "==> Deployed. Containers:"
dc ps
