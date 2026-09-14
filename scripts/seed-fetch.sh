#!/usr/bin/env bash
# Download the seed database dump into docker/backups/latest.sql.gz.
#
# The dump is a release asset, not a tracked file — see the "Seed release"
# section of lib/db.sh for why. bootstrap.sh calls this when the file is
# missing, so a fresh clone still sets up in one command; the repository is
# public and the asset needs no token.
#
# Usage:
#   ./scripts/seed-fetch.sh            fetch unless the file is already there
#   ./scripts/seed-fetch.sh --force    fetch even if it is
#   ./scripts/seed-fetch.sh --url URL  fetch from somewhere else
#
# Env:
#   BACKUP_DIR  where to write (default: docker/backups)
#   SEED_URL    the asset to download (default: the repo's `seed` release)
set -euo pipefail

trap 'status=$?; echo "Error: $(basename "$0") failed at line $LINENO (exit $status)." >&2' ERR

# shellcheck source=lib/db.sh
. "$(cd "$(dirname "$0")" && pwd)/lib/db.sh"

BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/docker/backups}"
DEST="${BACKUP_DIR}/${SEED_ASSET}"
FORCE=0

usage() {
  sed -n '2,16p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-2}"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --force|-f) FORCE=1; shift ;;
    --url) SEED_URL="$2"; shift 2 ;;
    -h|--help) usage 0 ;;
    *) echo "Unknown argument: $1" >&2; usage ;;
  esac
done

if [ -f "$DEST" ] && [ "$FORCE" != "1" ]; then
  echo "Seed dump already present: $DEST"
  echo "Re-download it with: $0 --force"
  exit 0
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "Error: curl is required to fetch the seed dump." >&2
  echo "       Download it by hand from $SEED_URL and save it to $DEST." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

# Downloaded to a temporary name and moved into place only once it is complete
# and verified, so an interrupted transfer cannot leave a half-written file
# looking like a usable dump — the same reason db-backup.sh writes .partial.
PARTIAL="${DEST}.partial"
trap 'rm -f "$PARTIAL"' EXIT

echo "Fetching the seed dump from $SEED_URL..."
if ! curl -fSL --retry 3 --retry-delay 2 -o "$PARTIAL" "$SEED_URL"; then
  cat >&2 <<EOF

Error: could not download the seed dump.

  The asset is published from a laptop that has the complete dataset:

      ./scripts/db-backup.sh --remote --publish

  Without it you can still start from an empty database — bootstrap.sh
  migrates and tells you how to ingest — but the Fast-F1 lap data is only
  refetchable at ~45 s a session.
EOF
  exit 1
fi

dump_verify_gzip "$PARTIAL"

mv "$PARTIAL" "$DEST"
trap - EXIT

SIZE=$(du -h "$DEST" | cut -f1)
echo "Seed dump saved: $DEST ($SIZE)"
echo ""
echo "Contents:"
dump_row_counts "$DEST"
