#!/usr/bin/env bash
# Fast-F1 data on the VPS — the two halves that need the database, and only those.
#
# Formula 1's live timing endpoints refuse this box's datacentre IP, so lap
# times and qualifying sector times cannot be fetched here at all — nor from a
# GitHub runner, which is refused the same way. They are fetched from a machine
# on a residential connection (scripts/fastf1-sync.sh) and arrive as a payload.
# What stays on the box is the part that needs PostgreSQL:
#
#   status   print the races still missing Fast-F1 data, as JSON on stdout
#   import   load a payload arriving on stdin, then purge the frontend cache
#
# The deploy copies this to /srv/apps/f1_api/fastf1.sh on every run, so it needs
# no repo checkout here — only the app directory, its .env and its .tag.
#
# Usage (on the VPS):
#   /srv/apps/f1_api/fastf1.sh status                       # everything missing, newest first
#   /srv/apps/f1_api/fastf1.sh status --limit 4 --current-year
#   /srv/apps/f1_api/fastf1.sh import < payload.ndjson.gz   # gzip or plain NDJSON
#   /srv/apps/f1_api/fastf1.sh import --dry-run < payload.ndjson.gz
#
# Over SSH, from the machine doing the fetching — which is what
# scripts/fastf1-sync.sh automates:
#   ssh hugo@vps '/srv/apps/f1_api/fastf1.sh status' > targets.json
#   ssh hugo@vps '/srv/apps/f1_api/fastf1.sh import' < payload.ndjson.gz
set -euo pipefail

APP_DIR="${APP_DIR:-/srv/apps/f1_api}"
cd "$APP_DIR"

# `status` writes JSON to stdout and nothing else, so every message this script
# prints goes to stderr. Callers redirect stdout straight into a file.
say() { echo "$@" >&2; }

for f in .env .tag docker-compose.yml; do
  if [ ! -f "$f" ]; then
    say "Error: $APP_DIR/$f not found."
    say "  .env comes from new-app.sh; docker-compose.yml and .tag are written"
    say "  by the deploy. Has this app ever been deployed?"
    exit 1
  fi
done

dc() { docker compose --env-file .env --env-file .tag "$@"; }

usage() {
  say "Usage: $(basename "$0") status [status flags]   # JSON on stdout"
  say "       $(basename "$0") import [import flags] < payload.ndjson.gz"
  exit 2
}

[ $# -ge 1 ] || usage
COMMAND="$1"
shift

case "$COMMAND" in
  status)
    # </dev/null: `compose run` attaches stdin, and this script is often fed to
    # a shell over SSH rather than executed from disk — without it the command
    # would eat the rest of the script.
    say "==> Listing races missing Fast-F1 data..."
    dc run --rm -T --entrypoint python ingest scripts/fastf1_status.py "$@" </dev/null
    ;;

  import)
    # No </dev/null here: stdin IS the payload, and `compose run -T` passes it
    # through to the container unchanged (gzip included).
    say "==> Importing Fast-F1 payload from stdin..."
    dc run --rm -T --entrypoint python ingest scripts/fastf1_import.py --payload - "$@"

    say "==> Validating (informational)..."
    dc run --rm -T --entrypoint python ingest scripts/validate.py </dev/null >&2 || true

    if [ -x "$APP_DIR/purge-cache.sh" ]; then
      "$APP_DIR/purge-cache.sh" >&2
    else
      say "    purge-cache.sh not found — skipping frontend cache purge."
    fi

    say ""
    say "==> Import complete."
    ;;

  *)
    say "Unknown command: $COMMAND"
    usage
    ;;
esac
