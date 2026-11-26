# shellcheck shell=bash

VPS_APP="${VPS_APP:-f1_api}"

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
