# VPS Migration Runbook

Moving the F1 Tracker backend off **Render + Neon** and onto a self-hosted VPS,
in Docker. The frontend **stays on Vercel** — only the API and the database move.

```
BEFORE                                  AFTER
  Vercel   ── Next.js                     Vercel   ── Next.js         (unchanged)
     │                                       │
     ▼  https://…onrender.com/api            ▼  https://f1-api.<your-domain>/api
  Render   ── FastAPI                     VPS
     │                                       ├── reverse proxy (Caddy / nginx / Traefik)
     ▼                                       ├── f1-tracker-api   (container)
  Neon     ── PostgreSQL                     └── f1-tracker-db    (container, private)

  GitHub Actions ── weekly ingest → Neon   systemd timer on the VPS ── weekly ingest → local DB
```

Everything the VPS side needs lives in this repo:

| Path | What it is |
| ---- | ---------- |
| `pipeline/Dockerfile` | API image (also runs migrations and the ingest job) |
| `docker/compose.prod.yml` | The production stack: `db` + `migrate` + `api` + `ingest` |
| `docker/compose.traefik.yml` | Overlay for a containerised Traefik proxy |
| `docker/.env.prod.example` | Template for the VPS environment file |
| `scripts/vps/deploy.sh` | Build, start, migrate, verify |
| `scripts/vps/ingest.sh` | Calendar-gated data ingest (+ Vercel cache purge) |
| `scripts/vps/backup.sh` | Nightly database dump |
| `docker/backups/latest.sql.gz` | Committed dump — the VPS's starting data |
| `deploy/systemd/` | Timers for ingest and backups |
| `deploy/caddy/`, `deploy/nginx/` | Reverse-proxy site configs |
| `.github/workflows/deploy.yml` | Redeploys the stack over SSH on push to `master` |

## Sharing the VPS with other projects

This VPS runs several projects, so the stack is namespaced end to end by
`STACK_NAME` (default `f1-tracker`):

| Object | Name |
| ------ | ---- |
| Compose project | `f1-tracker` |
| Containers | `f1-tracker-db`, `f1-tracker-api`, `f1-tracker-migrate`, `f1-tracker-ingest` |
| Volumes | `f1-tracker_pgdata`, `f1-tracker_fastf1_cache` |
| Network | `f1-tracker_internal` (private to this project) |
| Image | `f1-tracker-api:latest` |
| Labels | `com.f1tracker.stack=f1-tracker` on every container, volume and network |
| systemd units | `f1-tracker-ingest.timer`, `f1-tracker-backup.timer` |

So:

```bash
docker ps --filter label=com.f1tracker.stack=f1-tracker     # just this project
docker compose --env-file .env.prod -f docker/compose.prod.yml logs -f api
```

Two more things keep projects from stepping on each other:

- **PostgreSQL publishes no host port.** The database is reachable only over the
  project's own Docker network, so it can't collide with another project's
  Postgres (or be reached from the internet).
- **The API binds to loopback** on `API_PORT` (default 8000) for a host reverse
  proxy. Give each project its own port — or use the Traefik overlay, which
  publishes no host port at all.

---

## Prerequisites

- A VPS with Docker Engine 24+ and the Compose v2 plugin.
- A DNS `A`/`AAAA` record for the API, e.g. `f1-api.your-domain.com`.
- A reverse proxy on the VPS (Caddy, nginx, or Traefik) — samples in `deploy/`.
- A non-root deploy user in the `docker` group (the systemd units assume `deploy`).

---

## 1. Check out the repo on the VPS

```bash
sudo mkdir -p /opt/f1-tracker && sudo chown deploy:deploy /opt/f1-tracker
git clone https://github.com/hugoogb/f1-tracker.git /opt/f1-tracker
cd /opt/f1-tracker
```

## 2. Create the production environment file

```bash
cp docker/.env.prod.example .env.prod
chmod 600 .env.prod
$EDITOR .env.prod
```

Fill in at minimum:

| Variable | Value |
| -------- | ----- |
| `POSTGRES_PASSWORD` | `openssl rand -base64 32 \| tr -d '/+=' \| head -c 40` — alphanumerics only, it gets interpolated into a URL |
| `CORS_ORIGINS` | Your Vercel origin, e.g. `https://f1-tracker-web.vercel.app` (comma-separate extras, no trailing slash) |
| `API_PORT` | A loopback port no other project on this VPS uses |
| `REVALIDATE_URL` / `REVALIDATE_SECRET` | Same secret as the Vercel env var, so ingest can purge the frontend cache |

`.env.prod` is gitignored — it never leaves the server.

## 3. Bring up the stack

```bash
./scripts/vps/deploy.sh
```

This builds the image, starts PostgreSQL, runs `alembic upgrade head` via the
one-shot `migrate` service, starts the API, and blocks until `/api/health/db`
answers. The database is empty at this point — `/api/stats` returns zeros.

## 4. Load the data

Nothing is copied off Neon: the repo already carries the data, and the ingestors
can rebuild it from scratch. Pick whichever you prefer.

### Restore the committed dump (fastest)

```bash
FORCE=1 SKIP_MIGRATE=1 ./scripts/db-restore.sh docker/backups/latest.sql.gz
```

`SKIP_MIGRATE=1` because step 3 already brought the schema to head. The script
loads the data and then rebuilds the materialized views the career stats,
records and champions endpoints read from — those are not in the dump.

The dump is only as fresh as the last commit that refreshed it, and it carries
no `lap_times` or qualifying sector times (Fast-F1, ~45 s/session — see
`docker/backups/README.md`). The first scheduled ingest closes both gaps.

### Or seed from f1db

The ingestors upsert the whole dataset from one release download, so they
populate an empty database directly:

```bash
./scripts/vps/ingest.sh --force -- --base --layouts --colors --results \
  --qualifying --sprints --standings --pitstops --postprocess
```

That covers everything except lap times and qualifying sectors, which come from
Fast-F1 and are throttled to ~500 calls/hour — add `--laptimes` and
`--qualifying-sectors` (optionally with `--year-range 2018-2026`) in a separate,
much longer run, or let the weekly timer accumulate them.

Either way, check the result before moving on:

```bash
curl -fsS http://127.0.0.1:${API_PORT:-8000}/api/stats
```

## 5. Put the API behind the reverse proxy

**Caddy or nginx on the host** — copy the sample, replace the hostname, reload:

```bash
sudo cp deploy/caddy/f1-tracker.Caddyfile /etc/caddy/sites/f1-tracker.caddy
sudo systemctl reload caddy
# or
sudo cp deploy/nginx/f1-tracker-api.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/f1-tracker-api.conf /etc/nginx/sites-enabled/
sudo certbot --nginx -d f1-api.your-domain.com && sudo systemctl reload nginx
```

**Traefik in Docker** — set `API_DOMAIN` and `PROXY_NETWORK` in `.env.prod`, then
redeploy with the overlay (no host port is published in this mode):

```bash
docker network create edge          # once, if it doesn't exist
TRAEFIK=1 ./scripts/vps/deploy.sh
```

Verify from your laptop:

```bash
curl https://f1-api.your-domain.com/api/health      # {"status":"ok"}
curl https://f1-api.your-domain.com/api/health/db   # {"status":"ok","database":"ok"}
curl https://f1-api.your-domain.com/api/stats       # row counts — compare with the live site
```

## 6. Point Vercel at the VPS

In the Vercel project settings, set:

```
NEXT_PUBLIC_API_URL=https://f1-api.your-domain.com/api
```

`NEXT_PUBLIC_*` is baked in at build time, so **redeploy** the frontend for it to
take effect. Keep `REVALIDATE_SECRET` on Vercel matching `.env.prod`.

If the browser reports CORS errors, `CORS_ORIGINS` doesn't match the Vercel
origin exactly (scheme, host, no trailing slash). Fix it and `./scripts/vps/deploy.sh`.

## 7. Schedule ingest and backups

```bash
sudo cp deploy/systemd/f1-tracker-*.service deploy/systemd/f1-tracker-*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now f1-tracker-ingest.timer f1-tracker-backup.timer
systemctl list-timers 'f1-tracker-*'
```

Ingest runs Mondays 06:00 and skips itself unless a race ran in the last 3 days.
Backups run nightly into `/var/backups/f1-tracker` (deliberately outside the git
checkout, so `git pull` stays clean) keeping the last 14.

Run either by hand:

```bash
./scripts/vps/ingest.sh --force
./scripts/vps/backup.sh
sudo journalctl -u f1-tracker-ingest.service -n 100
```

## 8. Wire up deploys from CI

Everything above is a one-time setup. From here, `.github/workflows/deploy.yml`
redeploys on every push to `master` that touches `pipeline/`, `docker/`,
`deploy/`, `scripts/` or the workflow itself — it SSHes in and runs the same
`scripts/vps/deploy.sh --pull` you have been running by hand.

**On the VPS**, give CI its own key rather than reusing a personal one:

```bash
# On your workstation, not the server:
ssh-keygen -t ed25519 -C 'github-actions-f1-tracker' -f ~/.ssh/f1_deploy -N ''
ssh-copy-id -i ~/.ssh/f1_deploy.pub <deploy-user>@<vps-host>
ssh-keyscan <vps-host>          # keep this output for VPS_SSH_KNOWN_HOSTS
```

The deploy user must be in the `docker` group and own the checkout at
`/opt/f1-tracker`, which must be on `master` with a clean working tree —
`deploy.sh --pull` uses `git pull --ff-only` and will refuse to run over local
edits.

**On GitHub**, under Settings → Environments, create an environment named
`production` (add required reviewers there if you want deploys gated), then add
these to it (or to the repository) under Secrets and variables → Actions:

| Secret | Value |
| ------ | ----- |
| `VPS_HOST` | hostname or IP |
| `VPS_USER` | the deploy user |
| `VPS_SSH_KEY` | contents of `~/.ssh/f1_deploy` (the private half) |
| `VPS_SSH_KNOWN_HOSTS` | the `ssh-keyscan` output above |

| Variable (optional) | Default |
| ------------------- | ------- |
| `VPS_PORT` | `22` |
| `VPS_PATH` | `/opt/f1-tracker` |

`VPS_SSH_KNOWN_HOSTS` is not optional dressing: without it the runner would
accept any host key and a DNS or routing hijack could hand your deploy key to
someone else.

Verify with a manual run — Actions → Deploy to VPS → **Run workflow**. That
button also exposes an **ingest** checkbox, which runs `ingest.sh --force`
after the deploy for when you want data refreshed off-schedule.

The workflow never touches the database directly and holds no database
credentials; `.env.prod` stays on the server only.

## 9. Decommission Render and Neon

Once the site has been served from the VPS for a race weekend or two:

1. Delete the Render web service.
2. Delete the Neon project. Nothing is carried over from it — the VPS database is
   built from the committed dump or a fresh f1db seed — so take a final Neon dump
   first only if you want one for the archive.
3. Delete the now-unused GitHub secrets `NEON_DATABASE_URL`, `REVALIDATE_URL`,
   `REVALIDATE_SECRET` (the workflow that used them is gone; the VPS timer does
   the purge now).

---

## What changed in the repo

- **Removed** `.github/workflows/ingest.yml` and `scripts/update-neon.sh`. The
  VPS database isn't reachable from GitHub's runners by design; ingest now runs
  next to the database, on a systemd timer.
- **Added** the API `Dockerfile`, the production compose stack, and `scripts/vps/`.
- **`GET /api/health/db`** is new — readiness (can the API reach PostgreSQL?)
  separate from `/api/health` liveness.
- **`FASTAPI_DEBUG` now gates `/docs`, `/redoc` and `/openapi.json`**, which are
  off in production.
- **The local dev container was renamed** from `docker-db-1` to `f1-tracker-db`,
  and its volume from `docker_pgdata` to `f1-tracker_dev_pgdata`, so local and
  VPS naming match and `scripts/*.sh` work against either. On your dev machine
  this orphans the old volume — re-run `./scripts/bootstrap.sh` to recreate the
  database and restore the bundled backup, then clean up with
  `docker volume rm docker_pgdata`.
- **Scripts no longer hardcode the container name.** `scripts/lib/db.sh` resolves
  it from `STACK_NAME`/`DB_CONTAINER`, so `db-backup.sh` and `db-restore.sh` work
  locally and on the VPS.

## The ingest writes only to PostgreSQL

Every ingestor writes to the database and nothing else — there are no asset
downloads to sync back into the frontend. Structural and historical data comes
from a single f1db release archive (cached in the `${STACK_NAME}_f1db_cache`
volume), and lap times and qualifying sectors come from Fast-F1 sessions
(`${STACK_NAME}_fastf1_cache`). Both caches live on volumes, so a container
rebuild doesn't re-download them.

Pin the dataset by setting `F1DB_VERSION` to a release tag in `.env.prod`;
`latest` (the default) picks up the newest release on every run.

---

## Operations cheat sheet

```bash
cd /opt/f1-tracker
alias dc='docker compose --env-file .env.prod -f docker/compose.prod.yml'

dc ps                       # stack status
dc logs -f api              # follow API logs
dc restart api              # restart just the API
./scripts/vps/deploy.sh --pull   # pull latest master, rebuild, restart, verify

# psql shell (the database has no published port)
dc exec db psql -U f1tracker -d f1tracker

# Restore a nightly backup
FORCE=1 SKIP_MIGRATE=1 ./scripts/db-restore.sh /var/backups/f1-tracker/latest.sql.gz
```

### Troubleshooting

| Symptom | Check |
| ------- | ----- |
| `deploy.sh` times out waiting for readiness | `dc logs api` and `dc logs migrate` — usually a bad `DATABASE_URL` or a failed migration |
| CORS errors in the browser | `CORS_ORIGINS` must match the Vercel origin exactly; redeploy after changing it |
| 502 from the proxy | `API_PORT` in `.env.prod` must match the proxy upstream; with Traefik, the container must be on `PROXY_NETWORK` |
| Ingest does nothing | That's the calendar gate. `./scripts/vps/ingest.sh --force` to override |
| `git pull` refuses on the VPS | Something wrote into the checkout — backups belong in `/var/backups/f1-tracker` |
