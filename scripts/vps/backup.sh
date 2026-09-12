#!/usr/bin/env bash
# Dump the production database, gzipped, to stdout.
#
# This exists because the VPS is the only place the complete dataset lives.
# Formula 1 blocks the box's IP, so Fast-F1 lap times and qualifying sectors are
# fetched from a laptop and imported straight into production (`pnpm fastf1`) —
# they are never written to a developer's database on the way. A dump taken
# anywhere else is therefore missing exactly the data that is expensive to
# replace, at ~45 s per session.
#
# The database itself belongs to the platform's shared PostgreSQL, and so do its
# scheduled backups. This is not a replacement for those: it is the app-level
# export that produces docker/backups/latest.sql.gz in the repository, so a
# clone can restore the whole thing without fetching anything.
#
# pg_dump does not exist in the app image (it carries Python, not the PostgreSQL
# client), so it runs from a throwaway postgres container on the shared network
# — the same network that makes the hostname in DIRECT_URL resolve.
#
# Which postgres image is not a constant: pg_dump refuses outright to dump a
# server newer than itself ("aborting because of server version mismatch"), and
# the platform's shared cluster is upgraded on its own schedule, not this repo's.
# So the server is asked its version first — psql, unlike pg_dump, talks to any
# of them — and pg_dump then runs from the image matching that major. A platform
# upgrade changes which image is pulled, not this script.
#
# The deploy copies this to /srv/apps/f1_api/backup.sh on every run, so it needs
# no repo checkout on the server.
#
# Usage (on the VPS):
#   /srv/apps/f1_api/backup.sh > f1_api.sql.gz
#
# From a laptop — which is what `./scripts/db-backup.sh --remote` automates:
#   ssh hugo@vps '/srv/apps/f1_api/backup.sh' > docker/backups/latest.sql.gz
#
# Env:
#   PG_IMAGE        pin the client image instead of matching the server
#   PG_PROBE_IMAGE  image used to ask the server its version (default: postgres:alpine)
#   SHARED_NETWORK  the network PostgreSQL is on (default: data)
set -euo pipefail

APP_DIR="${APP_DIR:-/srv/apps/f1_api}"
cd "$APP_DIR"

# stdout is the dump and nothing else; every message goes to stderr so a caller
# can redirect stdout straight into a file.
say() { echo "$@" >&2; }

if [ ! -f .env ]; then
  say "Error: $APP_DIR/.env not found — it is where DIRECT_URL lives."
  say "  It comes from the platform's new-app.sh. Has this app ever been deployed?"
  exit 1
fi

# Parsed rather than sourced: .env holds passwords and URLs with characters a
# plain `source` would mangle or execute.
env_value() {
  sed -n "s/^$1=//p" .env | tail -1 | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

# Straight to PostgreSQL, not through PgBouncer: a dump is a long single
# session, and transaction pooling would break it.
DUMP_URL="$(env_value DIRECT_URL)"
[ -n "$DUMP_URL" ] || DUMP_URL="$(env_value DATABASE_URL)"
if [ -z "$DUMP_URL" ]; then
  say "Error: neither DIRECT_URL nor DATABASE_URL is set in $APP_DIR/.env."
  exit 1
fi

SHARED_NETWORK="${SHARED_NETWORK:-$(env_value SHARED_NETWORK)}"
SHARED_NETWORK="${SHARED_NETWORK:-data}"
PG_PROBE_IMAGE="${PG_PROBE_IMAGE:-postgres:alpine}"

# Run a postgres client image against the database. The URL travels as an
# environment variable rather than an argument so the password stays out of the
# box's process list, and </dev/null keeps `docker run` from eating the rest of
# this script when it arrives on an SSH session's stdin.
pg_client() {
  local image="$1"
  shift
  docker run --rm -i \
    --network "$SHARED_NETWORK" \
    -e PGCONNECT_TIMEOUT=30 \
    -e DUMP_URL="$DUMP_URL" \
    "$image" \
    sh -c "$1" \
    </dev/null
}

if [ -n "${PG_IMAGE:-}" ]; then
  say "==> Using pinned client image $PG_IMAGE."
else
  say "==> Asking the server which PostgreSQL version it is..."
  # server_version_num is 170006 for 17.6 — integer division gives the major.
  # psql is used rather than pg_dump precisely because it does not care that the
  # server is newer than the client.
  # `|| true`: a probe that cannot run at all must reach the explanation below,
  # not abort the script through `set -e` with only docker's error on screen.
  version_num="$(pg_client "$PG_PROBE_IMAGE" \
    'exec psql --dbname="$DUMP_URL" -At -c "SHOW server_version_num"' | tr -dc '0-9' || true)"
  if [ -z "$version_num" ]; then
    say "Error: could not read the server version — cannot pick a matching pg_dump."
    say "  Pin one yourself if the probe cannot run here: PG_IMAGE=postgres:17-alpine $0"
    exit 1
  fi
  PG_IMAGE="postgres:$((version_num / 10000))-alpine"
  say "    Server reports $version_num, so dumping with $PG_IMAGE."
fi

say "==> Dumping the f1_api database via $PG_IMAGE on network $SHARED_NETWORK..."

# --clean --if-exists makes the dump loadable over an existing database;
# --no-owner --no-privileges makes it loadable as a different role, which is
# what a developer's container is.
pg_client "$PG_IMAGE" \
  'exec pg_dump --dbname="$DUMP_URL" --format=plain --no-owner --no-privileges --clean --if-exists' \
  | gzip -9

say "==> Dump complete."
