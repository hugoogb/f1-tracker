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
#   PG_IMAGE        client image to run pg_dump from (default: postgres:16-alpine)
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

PG_IMAGE="${PG_IMAGE:-postgres:16-alpine}"
SHARED_NETWORK="${SHARED_NETWORK:-$(env_value SHARED_NETWORK)}"
SHARED_NETWORK="${SHARED_NETWORK:-data}"

say "==> Dumping the f1_api database via $PG_IMAGE on network $SHARED_NETWORK..."

# The URL is passed as an environment variable rather than an argument so the
# password does not show up in the box's process list. --clean --if-exists makes
# the dump loadable over an existing database; --no-owner --no-privileges makes
# it loadable as a different role, which is what a developer's container is.
#
# </dev/null: this script is often fed to a shell over SSH rather than executed
# from disk, and `docker run` attaches stdin — without it, it would eat the rest
# of the script.
docker run --rm -i \
  --network "$SHARED_NETWORK" \
  -e PGCONNECT_TIMEOUT=30 \
  -e DUMP_URL="$DUMP_URL" \
  "$PG_IMAGE" \
  sh -c 'exec pg_dump --dbname="$DUMP_URL" --format=plain --no-owner --no-privileges --clean --if-exists' \
  </dev/null \
  | gzip -9

say "==> Dump complete."
