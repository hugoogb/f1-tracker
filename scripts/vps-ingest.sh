#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/vps.sh
source "$ROOT/scripts/lib/vps.sh"

FORCE=0
GATE_DAYS="${GATE_DAYS:-3}"
SEED_FLAGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --force) FORCE=1; shift ;;
    --) shift; SEED_FLAGS=("$@"); break ;;
    *) echo "Unknown argument: $1 (custom seed flags go after \`--\`)" >&2; exit 2 ;;
  esac
done
[[ "$GATE_DAYS" =~ ^[0-9]+$ ]] || { echo "GATE_DAYS must be a number" >&2; exit 2; }

if [ "$FORCE" = "1" ]; then
  echo "==> Calendar gate skipped (--force)."
else
  echo "==> Calendar gate: did a race run in the last $GATE_DAYS day(s)?"
  gate=0
  vps_task job python scripts/should_ingest.py --days "$GATE_DAYS" --exit-code </dev/null || gate=$?
  case "$gate" in
    0) ;;
    1) echo "==> No recent race -- nothing to ingest."; exit 0 ;;
    *) echo "::error::The calendar check could not run (exit $gate)."; exit "$gate" ;;
  esac
fi

echo "==> Running ingest..."
if [ ${#SEED_FLAGS[@]} -gt 0 ]; then
  vps_task ingest "${SEED_FLAGS[@]}" </dev/null
else
  vps_task ingest </dev/null
fi

echo "==> Validating (informational)..."
vps_task job python scripts/validate.py </dev/null || true

if [ -z "${PURGE_SCOPE:-}" ]; then
  if [ ${#SEED_FLAGS[@]} -gt 0 ]; then PURGE_SCOPE=--all; else PURGE_SCOPE=--latest; fi
fi
case "$PURGE_SCOPE" in --all|--latest) ;; *) echo "PURGE_SCOPE must be --all or --latest" >&2; exit 2 ;; esac
PURGED=1
vps_task job bash scripts/purge_cache.sh "$PURGE_SCOPE" </dev/null || PURGED=0

echo ""
if [ "$PURGED" = "1" ]; then
  echo "==> Ingest complete."
else
  echo "==> Ingest complete, but the frontend cache was NOT purged -- pages may show"
  echo "    the old data for up to a day. Once fixed: pnpm fastf1 --purge"
fi
