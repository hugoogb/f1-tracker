# shellcheck shell=bash
# How every script here reaches the production box: CI (as `deploy`) and you
# (as `hugo`) alike. Sourced, never run.
#
# Nothing runs on the server's host any more. Each call is one verb of
# infra-setup's deploy-app.sh, the only thing CI's `deploy` user may run:
#
#   vps_deploy <sha> < compose       install that compose file as the stack and
#                                    deploy image <sha> (policy check, pull,
#                                    `migrate` task, `up -d --wait`). CI only.
#   vps_task <service> [args...]     a `tasks`-profile service from
#                                    docker/compose.prod.yml, `compose run`
#                                    with args as its command. stdin and stdout
#                                    pass straight through (an import reads its
#                                    payload from stdin, a backup writes the dump
#                                    to stdout); the task's exit status comes back.
#
# deploy-app.sh's own refusals exit 70, never 1, so a caller can tell "the task
# said no" from "the platform refused".
#
# Needs VPS_TARGET, user@host -- deploy@100.x.y.z from CI, hugo@100.x.y.z from a
# laptop. Arguments are quoted with %q for the remote shell, so they arrive as
# the same words they left as.

VPS_APP="${VPS_APP:-f1_api}"

# Set VPS_TARGET from a host (VPS_HOST, `--host`) and an optional user (VPS_USER,
# default hugo); a host that already reads user@host is used as is. With no
# host, explain where to put one and exit 2. The third argument is the example
# command line for passing it per run.
vps_target_from() {
  local host="$1" user="$2" per_run="$3"
  if [ -z "$host" ]; then
    cat >&2 <<EOF
Error: the server's address is not set (VPS_HOST), so there is nowhere to send this.

  Add it to ${ENV_FILE:-.env} (once):

      VPS_HOST=100.x.y.z        # the tailnet address of the VPS

  or pass it per run: $per_run
EOF
    exit 2
  fi
  case "$host" in
    *@*) VPS_TARGET="$host" ;;
    *) VPS_TARGET="${user:-hugo}@$host" ;;
  esac
}
VPS_SSH_OPTS=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=30)

vps_task() {
  [ -n "${VPS_TARGET:-}" ] || { echo "vps_task: VPS_TARGET is not set (user@host)" >&2; return 70; }
  ssh "${VPS_SSH_OPTS[@]}" "$VPS_TARGET" \
    "sudo -n -u hugo /srv/scripts/deploy-app.sh task ${VPS_APP} $(printf '%q ' "$@")"
}

vps_deploy() {
  [ -n "${VPS_TARGET:-}" ] || { echo "vps_deploy: VPS_TARGET is not set (user@host)" >&2; return 70; }
  ssh "${VPS_SSH_OPTS[@]}" "$VPS_TARGET" \
    "sudo -n -u hugo /srv/scripts/deploy-app.sh deploy ${VPS_APP} $(printf '%q' "$1")"
}
