#!/usr/bin/env bash
# Create a complete PostgreSQL backup: schema, every table's data, the Alembic
# stamp and the materialized views.
#
# This is a restore-from-nothing artifact, not a convenience seed. It carries
# `lap_times` and the qualifying sector columns — the Fast-F1 data that costs
# ~45 s per session to fetch and cannot be fetched from the VPS or from CI at
# all — so losing the database no longer means re-fetching all of it.
#
# Two sources:
#
#   ./scripts/db-backup.sh            dump the local dev container
#   ./scripts/db-backup.sh --remote   dump the VPS's production database
#
# --remote is the one that matters for the committed backup. Fast-F1 payloads
# are imported straight into production (`pnpm fastf1`), so the server is the
# only place the complete dataset exists. It runs `backup.sh` on the box over
# Tailscale SSH and streams the dump back here; VPS_HOST comes from .env, the
# same key scripts/fastf1-sync.sh reads.
#
# Env:
#   BACKUP_DIR        where to write (default: docker/backups)
#   BACKUP_KEEP_LAST  timestamped dumps to retain (default: 5)
#   DB_CONTAINER / STACK_NAME   which local container to dump
#   VPS_HOST / VPS_USER         the server, for --remote
set -euo pipefail

# `set -e` aborts without printing anything, which once turned a missing .env
# key into a bare "exit 1" and nothing else. Name the line instead.
trap 'status=$?; echo "Error: $(basename "$0") failed at line $LINENO (exit $status)." >&2' ERR

# shellcheck source=lib/db.sh
. "$(cd "$(dirname "$0")" && pwd)/lib/db.sh"

BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/docker/backups}"
APP_DIR="${APP_DIR:-/srv/apps/f1_api}"
SSH_OPTS=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=30)

REMOTE=0
HOST="${VPS_HOST:-$(env_get VPS_HOST)}"
USER_NAME="${VPS_USER:-$(env_get VPS_USER)}"

usage() {
  sed -n '2,27p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-2}"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --remote|--vps) REMOTE=1; shift ;;
    --host) HOST="$2"; REMOTE=1; shift 2 ;;
    --user) USER_NAME="$2"; shift 2 ;;
    -h|--help) usage 0 ;;
    *) echo "Unknown argument: $1" >&2; usage ;;
  esac
done

mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date -u +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/f1tracker_${TIMESTAMP}.sql.gz"
LATEST_COPY="${BACKUP_DIR}/latest.sql.gz"

# Written to a temporary name and moved into place only once it is complete, so
# an interrupted dump cannot leave a half-written file looking like a backup.
PARTIAL="${BACKUP_FILE}.partial"
trap 'rm -f "$PARTIAL"' EXIT

if [ "$REMOTE" = "1" ]; then
  if [ -z "$HOST" ]; then
    cat >&2 <<EOF
Error: --remote needs the server's address, and VPS_HOST is not set.

  Add it to $ENV_FILE (once):

      VPS_HOST=100.x.y.z        # the tailnet address of the VPS

  or pass it per run: $0 --remote --host 100.x.y.z
EOF
    exit 2
  fi
  case "$HOST" in
    *@*) TARGET="$HOST" ;;
    *) TARGET="${USER_NAME:-hugo}@$HOST" ;;
  esac

  echo "Dumping the production database on $TARGET..."
  # backup.sh writes the gzipped dump to stdout and narrates on stderr, so the
  # redirect here is the whole transfer.
  ssh "${SSH_OPTS[@]}" "$TARGET" "$APP_DIR/backup.sh" > "$PARTIAL"
else
  db_require_container
  echo "Dumping $POSTGRES_DB from container $DB_CONTAINER..."
  # A complete dump: no --data-only, no --exclude-table. --clean --if-exists so
  # it can be loaded over an existing database, --no-owner --no-privileges so it
  # restores under whatever role the target happens to use. Plain SQL rather
  # than a custom archive, because every restore path here pipes it into psql.
  db_exec pg_dump -U "$POSTGRES_USER" \
    --format=plain --no-owner --no-privileges --clean --if-exists \
    "$POSTGRES_DB" | gzip -9 > "$PARTIAL"
fi

if [ ! -s "$PARTIAL" ]; then
  echo "Error: the dump is empty — nothing was written." >&2
  exit 1
fi
dump_verify_gzip "$PARTIAL"

mv "$PARTIAL" "$BACKUP_FILE"
trap - EXIT

# Copied rather than symlinked: git tracks latest.sql.gz as a real file.
cp "$BACKUP_FILE" "$LATEST_COPY"

SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "Backup saved: $BACKUP_FILE ($SIZE)"
echo "              also copied to $LATEST_COPY"
echo ""

if ! dump_is_full "$BACKUP_FILE"; then
  echo "Warning: this dump carries no schema, so it can only be restored over a" >&2
  echo "         database Alembic has already migrated." >&2
fi

echo "Contents:"
COUNTS="$(dump_row_counts "$BACKUP_FILE")"
echo "$COUNTS"
echo ""

# The point of the exercise: a backup without the Fast-F1 data is one that still
# costs ~45 s a session to rebuild, so say so rather than let it pass as fine.
LAPS=$(echo "$COUNTS" | awk '$1 == "lap_times" { print $2 }')
if [ "${LAPS:-0}" -eq 0 ]; then
  cat >&2 <<EOF
Warning: this backup contains no lap times, so restoring it leaves the race
         pages' lap-time, tyre-strategy and position charts empty and the
         Fast-F1 data still to fetch.

  The complete dataset lives on the VPS — Fast-F1 payloads are imported
  straight into production. Dump that instead:

      ./scripts/db-backup.sh --remote

  Or fill this database in first: cd pipeline && uv run python scripts/seed.py \\
      --laptimes --qualifying-sectors
EOF
fi

# Rotate old backups — keep only the last N.
KEEP_LAST="${BACKUP_KEEP_LAST:-5}"
cd "$BACKUP_DIR"
# shellcheck disable=SC2012
ls -t f1tracker_*.sql.gz 2>/dev/null | tail -n +$((KEEP_LAST + 1)) | xargs -r rm --
REMAINING=$(ls f1tracker_*.sql.gz 2>/dev/null | wc -l)
echo "Backup rotation: keeping $REMAINING backup(s)."
