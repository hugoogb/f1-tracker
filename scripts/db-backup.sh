#!/usr/bin/env bash
set -euo pipefail

trap 'status=$?; echo "Error: $(basename "$0") failed at line $LINENO (exit $status)." >&2' ERR

# shellcheck source=lib/db.sh
. "$(cd "$(dirname "$0")" && pwd)/lib/db.sh"

BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/docker/backups}"

REMOTE=0
PUBLISH=0
HOST="${VPS_HOST:-$(env_get VPS_HOST)}"
USER_NAME="${VPS_USER:-$(env_get VPS_USER)}"

usage() {
  cat <<'EOF'
Create a complete PostgreSQL backup: schema, every table's data, the Alembic
stamp and the materialized views.

This is a restore-from-nothing artifact, not a convenience seed. It carries
`lap_times` and the qualifying sector columns — the Fast-F1 data that costs
~45 s per session to fetch and cannot be fetched from the VPS or from CI at
all — so losing the database no longer means re-fetching all of it.

Two sources:

  ./scripts/db-backup.sh            dump the local dev container
  ./scripts/db-backup.sh --remote   dump the VPS's production database

--remote is the one that matters for the published seed. Fast-F1 payloads
are imported straight into production (`pnpm fastf1`), so the server is the
only place the complete dataset exists. It runs the `backup` task on the box
(`vps_task backup`, scripts/lib/vps.sh) and streams the dump back here;
VPS_HOST comes from .env, the same key scripts/fastf1-sync.sh reads.

Add --publish to upload the result to the seed release, which is where
bootstrap.sh fetches it from. The dump is not tracked by git — see the "Seed
release" section of lib/db.sh — so publishing is what makes a new one reach
anyone else:

  ./scripts/db-backup.sh --remote --publish

Env:
  BACKUP_DIR        where to write (default: docker/backups)
  BACKUP_KEEP_LAST  timestamped dumps to retain (default: 5)
  DB_CONTAINER / STACK_NAME   which local container to dump
  VPS_HOST / VPS_USER         the server, for --remote
  SEED_TAG / SEED_REPO        the release to publish to, for --publish
EOF
  exit "${1:-2}"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --remote|--vps) REMOTE=1; shift ;;
    --publish) PUBLISH=1; shift ;;
    --host) HOST="$2"; REMOTE=1; shift 2 ;;
    --user) USER_NAME="$2"; shift 2 ;;
    -h|--help) usage 0 ;;
    *) echo "Unknown argument: $1" >&2; usage ;;
  esac
done

if [ "$PUBLISH" = "1" ] && ! command -v gh >/dev/null 2>&1; then
  cat >&2 <<EOF
Error: --publish needs the GitHub CLI, and gh is not on PATH.

  Install it (https://cli.github.com) and authenticate once with 'gh auth login',
  or drop --publish and upload the dump yourself. Upload the copy named
  $SEED_ASSET — the asset takes the file's basename, and that name is
  half the URL seed-fetch.sh downloads from:

      gh release upload $SEED_TAG $BACKUP_DIR/$SEED_ASSET --clobber --repo $SEED_REPO
EOF
  exit 2
fi

mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date -u +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/f1tracker_${TIMESTAMP}.sql.gz"
LATEST_COPY="${BACKUP_DIR}/latest.sql.gz"

PARTIAL="${BACKUP_FILE}.partial"
trap 'rm -f "$PARTIAL"' EXIT

if [ "$REMOTE" = "1" ]; then
  # shellcheck source=lib/vps.sh
  source "$PROJECT_DIR/scripts/lib/vps.sh"
  vps_target_from "$HOST" "$USER_NAME" "$0 --remote --host 100.x.y.z"

  echo "Dumping the production database on $VPS_TARGET..."
  vps_task backup </dev/null > "$PARTIAL"
else
  db_require_container
  echo "Dumping $POSTGRES_DB from container $DB_CONTAINER..."
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

cp "$BACKUP_FILE" "$LATEST_COPY"

SIZE=$(human_size "$BACKUP_FILE")
echo "Backup saved: $BACKUP_FILE ($SIZE)"
echo "              also copied to $LATEST_COPY"
echo ""

echo "Contents:"
COUNTS="$(dump_row_counts "$BACKUP_FILE")"
echo "$COUNTS"
echo ""

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

if [ "$PUBLISH" = "1" ]; then
  if [ "${LAPS:-0}" -eq 0 ]; then
    echo "" >&2
    echo "Error: refusing to publish a dump with no lap times — it would replace the" >&2
    echo "       seed with one that leaves every race page's charts empty." >&2
    echo "       Dump production instead: $0 --remote --publish" >&2
    exit 1
  fi

  echo ""
  echo "Publishing to the '$SEED_TAG' release of $SEED_REPO..."
  if ! gh release view "$SEED_TAG" --repo "$SEED_REPO" >/dev/null 2>&1; then
    echo "  Release '$SEED_TAG' does not exist yet — creating it."
    gh release create "$SEED_TAG" --repo "$SEED_REPO" \
      --title "Seed database dump" --notes "$(seed_release_notes "$BACKUP_FILE")"
  else
    gh release edit "$SEED_TAG" --repo "$SEED_REPO" \
      --notes "$(seed_release_notes "$BACKUP_FILE")" >/dev/null
  fi

  gh release upload "$SEED_TAG" "$LATEST_COPY" --clobber --repo "$SEED_REPO"

  echo "Published: $SEED_URL"
fi

KEEP_LAST="${BACKUP_KEEP_LAST:-5}"
cd "$BACKUP_DIR"
# shellcheck disable=SC2012
ls -t f1tracker_*.sql.gz 2>/dev/null | tail -n +$((KEEP_LAST + 1)) | xargs -r rm --
REMAINING=$(ls f1tracker_*.sql.gz 2>/dev/null | wc -l)
echo "Backup rotation: keeping $REMAINING backup(s)."
