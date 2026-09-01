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
| `scripts/vps/migrate-from-neon.sh` | One-time data copy out of Neon |
| `deploy/systemd/` | Timers for ingest and backups |
| `deploy/caddy/`, `deploy/nginx/` | Reverse-proxy site configs |

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
- Your current `NEON_DATABASE_URL`, for the one-time data copy.

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
| `NEON_DATABASE_URL` | Temporarily, for step 4. Delete it afterwards. |

`.env.prod` is gitignored — it never leaves the server.

## 3. Bring up the stack

```bash
./scripts/vps/deploy.sh
```

This builds the image, starts PostgreSQL, runs `alembic upgrade head` via the
one-shot `migrate` service, starts the API, and blocks until `/api/health/db`
answers. The database is empty at this point — `/api/stats` returns zeros.

## 4. Copy the data out of Neon

```bash
./scripts/vps/migrate-from-neon.sh
```

It dumps Neon's data (schema excluded — Alembic owns that), restores it into
`f1-tracker-db`, stamps the Alembic revision, and prints `/api/stats` so you can
compare against Neon.

Already have a dump? Pass it instead:

```bash
./scripts/vps/migrate-from-neon.sh /var/backups/f1-tracker/dump.sql.gz
```

The repo's bundled `docker/backups/latest.sql.gz` works too, but it is only as
fresh as the last commit — prefer dumping Neon directly.

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
curl https://f1-api.your-domain.com/api/stats       # row counts — compare with Neon
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

## 8. Decommission Render and Neon

Once the site has been served from the VPS for a race weekend or two:

1. Delete the Render web service.
2. Take a final Neon dump (`./scripts/vps/migrate-from-neon.sh` with `KEEP_DUMP=1`),
   then delete the Neon project.
3. Remove `NEON_DATABASE_URL` from `.env.prod`.
4. Delete the now-unused GitHub secrets `NEON_DATABASE_URL`, `REVALIDATE_URL`,
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

## Images are still a local, committed job

The `--images`, `--logos` and `--layouts` ingestors write PNG/SVG assets into
`apps/web/public/`, which **Vercel serves from the git repo** — a container on the
VPS writing there would have nowhere to put them. The scheduled VPS ingest
deliberately runs only the data ingestors. When new drivers or teams appear:

```bash
cd pipeline && uv run python scripts/seed.py --images --logos --layouts
cd .. && git add apps/web/public && git commit -m "chore: refresh driver/team assets"
```

Pushing that commit redeploys Vercel with the new assets.

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
