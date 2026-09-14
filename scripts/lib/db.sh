#!/usr/bin/env bash
# Shared PostgreSQL/container settings for the scripts in this repo.
# Source it, don't execute it:  . "$(dirname "$0")/lib/db.sh"
#
# This covers the LOCAL development database only. Production runs on the VPS
# platform's shared PostgreSQL, which this repo neither starts nor backs up —
# see docs/DEPLOYMENT.md.
#
# Everything is overridable by environment variable or by a key in the repo-root
# .env:
#
#   local  : STACK_NAME=f1-tracker            → container f1-tracker-db
#   staging: STACK_NAME=f1-tracker-staging    → container f1-tracker-staging-db

# shellcheck disable=SC2034  # these are consumed by the sourcing script

_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$_LIB_DIR")")"
ENV_FILE="${ENV_FILE:-$PROJECT_DIR/.env}"

# Read a single key out of the env file without sourcing it — values may contain
# characters (#, spaces, quotes) that a plain `source` would mangle or execute.
#
# An absent key yields an empty value and exit status 0. That is load-bearing,
# not tidiness: every caller runs under `set -euo pipefail`, and a lookup that
# exited non-zero would abort the script on the spot with no message at all.
# `grep` does exactly that when it matches nothing, so this uses `sed`, which
# reports "no match" as empty output — the same reason scripts/fastf1-sync.sh
# parses .env that way. Optional keys are normal here: VPS_USER ships commented
# out in .env.example, and DB_CONTAINER is usually absent entirely.
env_get() {
  local key="$1"
  [ -f "$ENV_FILE" ] || return 0
  sed -n "s/^${key}=//p" "$ENV_FILE" | tail -n1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"
}

STACK_NAME="${STACK_NAME:-$(env_get STACK_NAME)}"
STACK_NAME="${STACK_NAME:-f1-tracker}"

DB_CONTAINER="${DB_CONTAINER:-$(env_get DB_CONTAINER)}"
DB_CONTAINER="${DB_CONTAINER:-${STACK_NAME}-db}"

POSTGRES_USER="${POSTGRES_USER:-$(env_get POSTGRES_USER)}"
POSTGRES_USER="${POSTGRES_USER:-f1tracker}"

POSTGRES_DB="${POSTGRES_DB:-$(env_get POSTGRES_DB)}"
POSTGRES_DB="${POSTGRES_DB:-f1tracker}"

# Compose file to fall back on when the database container isn't running.
COMPOSE_FILE="${COMPOSE_FILE:-$PROJECT_DIR/docker/docker-compose.yml}"

# --- Helpers -----------------------------------------------------------------

db_exec() { docker exec "$DB_CONTAINER" "$@"; }
db_exec_i() { docker exec -i "$DB_CONTAINER" "$@"; }
db_psql() { db_exec_i psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"; }

db_container_running() {
  [ -n "$(docker ps -q --filter "name=^/${DB_CONTAINER}$" 2>/dev/null)" ]
}

db_require_container() {
  if ! db_container_running; then
    echo "Error: database container '$DB_CONTAINER' is not running." >&2
    echo "  Start it with: docker compose -f $COMPOSE_FILE up -d" >&2
    echo "  Or point the scripts at another one: DB_CONTAINER=<name> $0" >&2
    exit 1
  fi
}

db_wait_ready() {
  local timeout="${1:-60}"
  local waited=0
  echo "    Waiting for PostgreSQL in '$DB_CONTAINER'..."
  until db_exec pg_isready -U "$POSTGRES_USER" -q 2>/dev/null; do
    if [ "$waited" -ge "$timeout" ]; then
      echo "Error: PostgreSQL not ready after ${timeout}s." >&2
      exit 1
    fi
    sleep 1
    waited=$((waited + 1))
  done
  echo "    PostgreSQL is ready."
}

# --- Dump inspection ---------------------------------------------------------
# These read a gzipped plain-SQL dump, so they behave the same whether the file
# was written here or pulled off the VPS. Each decompresses the whole file
# rather than stopping at the first hit: closing the pipe early kills gunzip
# with SIGPIPE, and under `set -o pipefail` that failure would be read as an
# answer.

# Is the file a full dump (schema, data, Alembic stamp, materialized views) or
# one of the data-only dumps this repo used to write? That decides the restore
# order — a full dump brings its own schema, a data-only one needs the schema
# migrated into place first.
dump_is_full() {
  local matches
  matches="$(gunzip -c "$1" | grep -c '^CREATE TABLE ' || true)"
  [ "${matches:-0}" -gt 0 ]
}

# Fail early and clearly on a truncated or corrupt archive, rather than halfway
# through a restore that has already dropped the old data.
dump_verify_gzip() {
  if ! gzip -t "$1" 2>/dev/null; then
    echo "Error: $1 is not a valid gzip archive (truncated or corrupt)." >&2
    return 1
  fi
}

# Row counts per table, read out of the dump's COPY blocks. The artifact is what
# gets restored, so it is the artifact that gets counted rather than the
# database it came from. qualifying_results also reports how many rows carry
# Fast-F1 sector times, which live in columns rather than a table of their own.
dump_row_counts() {
  gunzip -c "$1" | awk -F'\t' '
    # COPY headers are space-separated; the data between them is tab-separated,
    # which is what FS is set for. Match on the whole line and split it here.
    /^COPY public\.[a-z_]+ \(/ {
      split($0, head, " ")
      table = head[2]; sub(/^public\./, "", table)
      rows = 0; sectors = 0; qidx = 0
      if (table == "qualifying_results") {
        cols = $0
        sub(/^[^(]*\(/, "", cols); sub(/\).*$/, "", cols)
        n = split(cols, col, ", ")
        for (i = 1; i <= n; i++) if (col[i] == "q1_s1_ms") qidx = i
      }
      copying = 1
      next
    }
    copying && $0 == "\\." {
      line = sprintf("  %-22s %8d rows", table, rows)
      if (qidx) line = line sprintf("  (%d with Fast-F1 sector times)", sectors)
      print line
      copying = 0
      next
    }
    copying {
      rows++
      if (qidx && $qidx != "\\N") sectors++
    }
  '
}

# --- Seed release ------------------------------------------------------------
# Where the seed dump lives now that it is no longer committed. It is a release
# asset rather than a tracked file because gzip does not delta-compress: every
# refresh used to add its full size to the pack permanently, and nine
# superseded copies had grown the clone to ~49 MB for a ~5 MB artifact.
#
# One rolling tag rather than a dated one, so the download URL is a constant
# that bootstrap.sh can hard-code — no API call, no token, no release lookup on
# a fresh clone. `gh release upload --clobber` replaces the asset in place.
SEED_REPO="${SEED_REPO:-hugoogb/f1-tracker}"
SEED_TAG="${SEED_TAG:-seed}"
SEED_ASSET="${SEED_ASSET:-latest.sql.gz}"
SEED_URL="${SEED_URL:-https://github.com/${SEED_REPO}/releases/download/${SEED_TAG}/${SEED_ASSET}}"

# Release notes for the seed asset. The tag is rolling, so the notes are the
# only record of what the current asset actually contains — which matters most
# for lap_times, the half that is expensive to rebuild.
seed_release_notes() {
  local file="$1"
  cat <<EOF
Complete PostgreSQL dump used by \`scripts/bootstrap.sh\`. Not tracked in git —
fetch it with \`./scripts/seed-fetch.sh\`, replace it with
\`./scripts/db-backup.sh --remote --publish\`.

Taken from production on $(date -u +%Y-%m-%d) ($(du -h "$file" | cut -f1) gzipped).

\`\`\`
$(dump_row_counts "$file")
\`\`\`

Data: f1db (CC BY 4.0) and Fast-F1 (MIT). See ATTRIBUTIONS.md.
EOF
}
