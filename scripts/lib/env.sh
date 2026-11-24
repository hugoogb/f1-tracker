# shellcheck shell=bash
# Read keys out of the repo-root .env. Sourced, never run.
#
# The file is shared with the frontend, the backend and docker compose, so it is
# parsed rather than sourced — values may contain characters (#, spaces, quotes)
# that a plain `source` would mangle or execute.

_ENV_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-$(dirname "$(dirname "$_ENV_LIB_DIR")")/.env}"

# One KEY=value, the last if repeated, with one pair of matching quotes removed.
#
# An absent key yields an empty value and exit status 0. That is load-bearing,
# not tidiness: every caller runs under `set -euo pipefail`, and a lookup that
# exited non-zero would abort the script on the spot with no message at all.
# `grep` does exactly that when it matches nothing, so this uses `sed`, which
# reports "no match" as empty output. Optional keys are normal: VPS_USER ships
# commented out in .env.example, and DB_CONTAINER is usually absent entirely.
env_get() {
  local key="$1"
  [ -f "$ENV_FILE" ] || return 0
  sed -n "s/^${key}=//p" "$ENV_FILE" | tail -n1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"
}
