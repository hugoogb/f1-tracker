# VPS Deployment Runbook

The F1 Tracker backend (API + data pipeline) runs as a Docker container on the
self-hosted VPS, alongside the other apps on that box. The frontend **stays on
Vercel** — only the API and the database live here.

```
  Vercel  ── Next.js
     │
     ▼  https://f1-api.<your-domain>/api
  VPS
   ├── Caddy                 (platform, terminates TLS)
   ├── f1_api                (this app's container)
   ├── PgBouncer → PostgreSQL (platform, shared; database `f1_api`)
   └── f1-tracker-ingest.timer
```

**The platform owns the server.** Tailscale SSH, Caddy, the shared PostgreSQL,
PgBouncer, GHCR credentials and `new-app.sh` are all set up once for the box and
documented in its own `SETUP.md`. This runbook only covers what is specific to
F1 Tracker.

## What this repository ships

| Path | What it is |
| ---- | ---------- |
| `pipeline/Dockerfile` | The image — API, Alembic migrations and the ingest job in one |
| `docker/compose.prod.yml` | The stack. Copied to `/srv/apps/f1_api/compose.yaml` on every deploy |
| `docker/.env.prod.example` | The app-specific keys to append to `/srv/apps/f1_api/.env` |
| `scripts/vps/ingest.sh` | Calendar-gated ingest. Copied to `/srv/apps/f1_api/ingest.sh` on every deploy |
| `deploy/systemd/` | The weekly ingest timer |
| `.github/workflows/deploy.yml` | Builds the image, pushes to GHCR, deploys over Tailscale SSH |

Note what is *not* here: no Postgres container, no backup script, no reverse
proxy config. The platform provides all three.

## How a deploy works

A push to `master` touching `pipeline/`, `docker/compose.prod.yml` or
`scripts/vps/` builds `ghcr.io/hugoogb/f1_api:<sha>`, joins the tailnet as
`tag:ci`, and over SSH:

1. ships `compose.yaml` and `ingest.sh` into `/srv/apps/f1_api/`
2. writes `TAG=<sha>` to `.tag`
3. `docker compose pull`
4. `docker compose run --rm migrate` — Alembic against `DIRECT_URL`
5. `docker compose up -d --wait` — blocks on the container healthcheck
6. verifies `/api/health/db`, then prunes dangling images

Migrations run as their own step rather than from the app's startup path, so a
failed migration fails the deploy instead of leaving the API crash-looping
against a half-migrated database. They use `DIRECT_URL` because PgBouncer's
transaction pooling cannot carry a migration.

## First deploy

1. **`new-app.sh f1_api`** on the box, if it has not been run. It creates
   `/srv/apps/f1_api/`, the `f1_api` database and the `.env`. The deploy does
   `cd /srv/apps/f1_api`; push before this exists and the job fails on a missing
   directory.

2. **Append the app keys to `/srv/apps/f1_api/.env`** — `CORS_ORIGINS` is
   required and the API will not start without it. See
   `docker/.env.prod.example` for the full list.

3. **Check the three repository secrets** are set: `VPS_HOST`,
   `TS_OAUTH_CLIENT_ID`, `TS_OAUTH_SECRET`. There is no SSH key — the server
   runs Tailscale SSH and authenticates by tailnet identity.

4. **Deploy** — push to `master`, or Actions → deploy → Run workflow.

5. **Load the data.** The database starts empty. The f1db ingestors upsert the
   whole dataset from one release download, so they populate it directly — about
   two minutes:

   ```bash
   /srv/apps/f1_api/ingest.sh --force -- \
     --base --layouts --colors --results --qualifying \
     --sprints --standings --pitstops --postprocess
   ```

   That covers everything except lap times and qualifying sector times, which
   come from Fast-F1 at roughly one session per 45 s. Add them a few seasons at a
   time, or let the weekly timer accumulate them:

   ```bash
   /srv/apps/f1_api/ingest.sh --force -- --laptimes --qualifying-sectors --year-range 2024-2026
   ```

   Check the result:

   ```bash
   cd /srv/apps/f1_api
   docker compose --env-file .env --env-file .tag exec -T f1_api \
     curl -fsS http://127.0.0.1:8000/api/stats
   ```

6. **Point Caddy** at `127.0.0.1:${API_PORT}` for the API hostname, per the
   platform's `SETUP.md`.

7. **Set `NEXT_PUBLIC_API_URL`** on Vercel to `https://<api-host>/api` and
   redeploy the frontend. Make sure that origin is in `CORS_ORIGINS`.

8. **Schedule the ingest:**

   ```bash
   sudo cp deploy/systemd/f1-tracker-ingest.{service,timer} /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now f1-tracker-ingest.timer
   systemctl list-timers 'f1-tracker-*'
   ```

   Mondays 06:00, and it skips itself unless a race ran in the last 3 days.

## Rollback

Deploys are tagged by commit SHA, so rolling back does not need CI:

```bash
cd /srv/apps/f1_api
echo "TAG=<previous-sha>" > .tag
docker compose --env-file .env --env-file .tag pull
docker compose --env-file .env --env-file .tag up -d --wait
```

A rollback across a migration is not automatic — Alembic downgrades are not run
by the deploy. Check whether the range you are rolling back over contains one.

## Operations cheat sheet

```bash
cd /srv/apps/f1_api
dc() { docker compose --env-file .env --env-file .tag "$@"; }

dc ps                      # what's running, and its health
dc logs -f --tail 100      # follow the API
dc exec -T f1_api curl -fsS http://127.0.0.1:8000/api/health/db

./ingest.sh --force        # ingest now, ignoring the calendar gate
sudo journalctl -u f1-tracker-ingest.service -n 100

dc run --rm --entrypoint python ingest scripts/validate.py   # data completeness
dc run --rm migrate                                          # re-run migrations
```

## Troubleshooting

**`no such file or directory: /srv/apps/f1_api`** — `new-app.sh f1_api` has not
been run.

**`denied` / `unauthorized` on `docker compose pull`** — the server is not logged
in to GHCR, or its token expired or lacked `read:packages`. Check on the box with
`docker pull ghcr.io/hugoogb/f1_api:latest`.

**The SSH step hangs, then fails** — the tailnet policy's `ssh` rule for `tag:ci`
says `check` rather than `accept`. `check` wants a human at a browser.

**`Permission denied` or `failed to look up user`** — the `ssh` rule does not
list `hugo` in `users`, or the server is not tagged `tag:server`.

**`up -d --wait` fails but the container is running** — the healthcheck never went
green. `dc logs f1_api`. The usual cause is the API failing to start because
`CORS_ORIGINS` is missing from `.env`.

**The API starts but `/api/health/db` returns 503** — `DATABASE_URL` is wrong or
PgBouncer is unreachable from the container. If PgBouncer is a container on a
shared Docker network rather than published on the host, this stack has to join
that network — see the note at the bottom of `docker/compose.prod.yml`.

**Migrations fail with a prepared-statement or pooling error** — `DIRECT_URL` is
unset in `.env`, so migrate fell back to the PgBouncer URL.
