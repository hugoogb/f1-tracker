# shellcheck shell=bash
# How every script here reaches the production box: CI (as `deploy`) and you
# (as `hugo`) alike. Sourced, never run.
#
# Nothing runs on the server's host any more. Each call is one verb of
# infra-setup's deploy-app.sh, the only thing CI's `deploy` user may run:
#
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
VPS_SSH_OPTS=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=30)

vps_task() {
  [ -n "${VPS_TARGET:-}" ] || { echo "vps_task: VPS_TARGET is not set (user@host)" >&2; return 70; }
  ssh "${VPS_SSH_OPTS[@]}" "$VPS_TARGET" \
    "sudo -n -u hugo /srv/scripts/deploy-app.sh task ${VPS_APP} $(printf '%q ' "$@")"
}
