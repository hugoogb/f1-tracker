# Deployment Guide

How to run F1 Tracker locally and in production.

Production is **Next.js on Vercel + the API as a Docker container on a
self-hosted VPS**, with PostgreSQL provided by that VPS's shared cluster. The
server itself (Tailscale SSH, Caddy, PostgreSQL, PgBouncer, GHCR, `new-app.sh`)
is set up once and documented in the platform's own `SETUP.md`; everything
specific to this app is below.

## Architecture

```
                    ┌──────────────────┐
   Browser ────────▶│  Vercel (Next.js)│
                    └────────┬─────────┘
                             │  https://f1-api.your-domain.com/api
                             ▼
                    ┌──────────────────────────────────────────┐
                    │  VPS                                     │
                    │  ┌────────────────────────────────────┐  │
                    │  │ Caddy            (platform)        │  │
                    │  └────────────┬───────────────────────┘  │
                    │               │ 127.0.0.1:${API_PORT}    │
                    │  ┌────────────▼──────────┐               │
                    │  │ f1_api                │  FastAPI      │
                    │  └────────────┬──────────┘               │
                    │               │ DATABASE_URL             │
                    │  ┌────────────▼──────────┐               │
                    │  │ PgBouncer → PostgreSQL│  (platform,   │
                    │  └───────────────────────┘   shared)     │
                    └──────────────────────────────────────────┘
```

The image is built by CI and pushed to GHCR; the server pulls it. Nothing is
built on the box, and the repository is not checked out there.

The frontend is served by Vercel and calls the API cross-origin, so `CORS_ORIGINS`
on the API must list the Vercel domain.

## Prerequisites

### Local development

| Tool    | Version | Purpose             |
| ------- | ------- | ------------------- |
| Docker  | 24+     | PostgreSQL          |
| Node.js | 20+     | Next.js frontend    |
| pnpm    | 10+     | Frontend packages   |
| Python  | 3.12+   | FastAPI backend     |
| uv      | latest  | Python packages     |

### VPS

Nothing this repository installs. The platform provides Docker, Caddy,
PostgreSQL + PgBouncer, Tailscale SSH and GHCR credentials; `new-app.sh f1_api`
creates `/srv/apps/f1_api/`, the `f1_api` database and its `.env`. Python, uv and
Node are not needed on the server.

## Environment Variables

Two files, one per environment. Neither is committed.

### `.env` (local development — template: `.env.example`)

| Variable              | Default                                                        | Description                                    |
| --------------------- | -------------------------------------------------------------- | ---------------------------------------------- |
| `STACK_NAME`          | `f1-tracker`                                                    | Names the compose project, container and volume |
| `POSTGRES_DB`/`_USER`/`_PASSWORD` | `f1tracker` / `f1tracker` / `f1tracker_dev`          | Dev database credentials                        |
| `DB_BIND` / `DB_PORT` | `127.0.0.1` / `5432`                                            | Where the dev database is published             |
| `DATABASE_URL`        | `postgresql://f1tracker:f1tracker_dev@localhost:5432/f1tracker` | Connection string used by the backend           |
| `FASTAPI_HOST` / `_PORT` | `0.0.0.0` / `8000`                                           | Backend listen address                          |
| `FASTAPI_DEBUG`       | `true`                                                          | Also gates `/docs`, `/redoc`, `/openapi.json`   |
| `CORS_ORIGINS`        | `http://localhost:3000`                                         | Comma-separated allowed origins                 |
| `F1DB_VERSION`        | `latest`                                                        | f1db release to ingest; pin a tag for reproducible seeds |
| `F1DB_CACHE_DIR`      | `.f1db_cache`                                                   | f1db release archive cache directory            |
| `FASTF1_CACHE_DIR`    | `.fastf1_cache`                                                 | Fast-F1 session cache directory                 |
| `VPS_HOST`            | —                                                               | Server address for `pnpm fastf1` (local only)   |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000/api`                                     | Backend URL, baked into the bundle at build time |
| `REVALIDATE_URL` / `REVALIDATE_SECRET` | —                                              | Frontend cache purge after ingest               |

### `/srv/apps/f1_api/.env` (VPS — template: `docker/.env.prod.example`)

`new-app.sh` writes the platform's half of this file. Append the app's own keys.

| Variable | Required | Description |
| -------- | -------- | ----------- |
| `DATABASE_URL` | ✅ (from new-app.sh) | Through PgBouncer — what the API uses |
| `DIRECT_URL` | (from new-app.sh) | Straight to PostgreSQL — migrations and ingest. Falls back to `DATABASE_URL` |
| `SHARED_NETWORK` | | The Docker network PostgreSQL and PgBouncer are on — this stack joins it so those hostnames resolve. Defaults to `data` |
| `PROXY_NETWORK` | | The Docker network Caddy is on; the API joins it so Caddy can reach `f1_api:8000`. Defaults to `edge` |
| `CORS_ORIGINS` | ✅ | Your Vercel origin(s), comma-separated, no trailing slash |
| `FASTAPI_DEBUG` | | `false` in production — keeps the OpenAPI docs off |
| `API_WORKERS` | | uvicorn workers (default 2) |
| `API_BIND` / `API_PORT` | | Loopback bind for Caddy to forward to (default `127.0.0.1:8000`) |
| `API_MEMORY_LIMIT` | | Container memory cap (default 1g) |
| `F1DB_VERSION` | | f1db release to ingest; pin a tag for reproducible seeds |
| `IMAGE_REPO` | | Override the GHCR image (default `ghcr.io/hugoogb/f1_api`) |
| `REVALIDATE_URL` / `REVALIDATE_SECRET` | | Cache purge after a successful ingest |

`TAG` is not in this file — the deploy writes it to `/srv/apps/f1_api/.tag`, and
both env files are passed to every compose call.

> `NEXT_PUBLIC_API_URL` is baked into the Next.js bundle at build time — it lives
> in the Vercel project settings, not on the VPS, and needs a redeploy to change.

---

## Local Development

### Quick start (one command)

```bash
./scripts/bootstrap.sh
```

Creates `.env` if missing, starts PostgreSQL (container `f1-tracker-db`), runs
migrations, restores the bundled data backup, and installs frontend deps. Then
start the servers it prints.

### Manual equivalent

```bash
docker compose -f docker/docker-compose.yml up -d   # 1. database
cd pipeline && uv run alembic upgrade head          # 2. schema
cd .. && ./scripts/db-restore.sh                    # 3. data (or seed.py for a full ingest)
cd pipeline && uv run uvicorn src.api.main:app --reload   # 4. API on :8000
pnpm install && pnpm dev                            # 5. frontend on :3000
```

### Running the backend image locally

`docker/compose.prod.yml` targets the VPS (it pulls from GHCR and expects the
platform's database), so it is not the way to run the backend locally. Build and
run the image directly against the dev database instead:

```bash
docker build -t f1-tracker-api:dev -f pipeline/Dockerfile pipeline
docker run --rm -p 8000:8000 --network host \
  -e DATABASE_URL="postgresql://f1tracker:f1tracker_dev@localhost:5432/f1tracker" \
  -e CORS_ORIGINS="http://localhost:3000" \
  f1-tracker-api:dev
curl http://127.0.0.1:8000/api/health/db
```

---

## Production: Vercel + VPS

Already done for `f1-api.hugoogb.dev`. This is the recipe for standing it up
again — a rebuilt box, a second environment, disaster recovery.

### 1. Backend on the VPS

`new-app.sh f1_api` on the box creates `/srv/apps/f1_api/`, the database and the
`.env`; append the app keys from `docker/.env.prod.example` to that `.env`. After
that, deploys are a push to `master` — CI builds the image, pushes it to GHCR and
restarts the container. Nothing is built on the server.

### 2. Load the data

The database starts empty. The f1db ingestors upsert the whole dataset from one
release download, so they populate it directly (about two minutes):

```bash
/srv/apps/f1_api/ingest.sh --force -- \
  --base --layouts --colors --results --qualifying \
  --sprints --standings --pitstops --postprocess
```

Lap times and qualifying sector times cannot be loaded from the box — Formula 1
blocks its IP, and GitHub's runners with it. Fetch them from a laptop instead:
`pnpm fastf1 --all --oldest-first` (see *Fast-F1 data* under Data Updates). It
is throttled to ~45 s a session, so a load from 2018 runs for hours; it can be
stopped and resumed at any point.

### 3. Reverse proxy

Caddy runs as a container on the `edge` network, which the API joins, so the
upstream is the service name and port:

```
f1-api.<your-domain> {
  import common
  reverse_proxy f1_api:8000
}
```

Not `127.0.0.1:${API_PORT}` — inside a containerised Caddy, loopback is Caddy
itself. And not `:3000`, which is what `new-app.sh` fills in from the platform's
Node template; this app serves on 8000.

Reload after editing, and verify the config Caddy actually parsed rather than
the file you edited — they are not always the same one:

```bash
docker exec caddy caddy reload --config /etc/caddy/Caddyfile
docker exec caddy caddy adapt --config /etc/caddy/Caddyfile 2>/dev/null | grep -o 'f1_api:[0-9]*'
```

### 4. Frontend on Vercel

Set `NEXT_PUBLIC_API_URL` to `https://<api-host>/api` in the Vercel project and
redeploy — it is baked into the bundle at build time. Add that Vercel origin to
`CORS_ORIGINS` on the VPS.

### 5. Verify

```bash
cd /srv/apps/f1_api
docker compose --env-file .env --env-file .tag ps
docker compose --env-file .env --env-file .tag exec -T f1_api \
  curl -fsS http://127.0.0.1:8000/api/health/db
curl -fsS https://<api-host>/api/stats
```

## Sharing the VPS with other projects

The box runs several apps, so this one stays inside its own lane:

- **One name everywhere.** `f1_api` is the compose project, the container, the
  database and the GHCR image, so `docker ps` and `docker volume ls` never leave
  you guessing which app an object belongs to.
- **Loopback only.** The API publishes on `127.0.0.1:${API_PORT}`; pick a port no
  other app uses. Only Caddy reaches it.
- **The database is not this app's to run.** It is one database on the shared
  cluster, reached through PgBouncer, provisioned by `new-app.sh`.
- **Log rotation (10 MB × 3) and a memory cap**, so one app cannot fill the disk
  or starve the others.

## Security

### Frontend security headers

Set on all routes in `apps/web/next.config.ts`:

| Header | Value | Purpose |
| ------ | ----- | ------- |
| `X-Frame-Options` | `DENY` | Prevents clickjacking via iframes |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME type sniffing |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Controls referrer info |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Disables unused browser APIs |
| `X-DNS-Prefetch-Control` | `on` | Enables DNS prefetching |

### Backend security

- **Container runs as a non-root user** (`app`, uid 10001).
- **PostgreSQL is not exposed** — no published port, `scram-sha-256` auth, and it
  is reachable only on the project's internal Docker network.
- **OpenAPI docs are off in production** (`FASTAPI_DEBUG=false` disables `/docs`,
  `/redoc` and `/openapi.json`).
- **CORS**: `GET` and `OPTIONS` only (read-only API), origins from `CORS_ORIGINS`.
- **Input validation**: query parameters bounded via FastAPI's `Query()`.
- **No raw SQL**: SQLAlchemy ORM with parameterized statements throughout.
- **Path validation**: static asset routes validate against directory traversal.
- **TLS terminates at the reverse proxy**; the API runs with `--proxy-headers` so
  it sees the real client scheme and address.

### Production checklist

- [ ] `/srv/apps/f1_api/.env` is `chmod 600`
- [ ] `CORS_ORIGINS` limited to your frontend domain(s)
- [ ] `FASTAPI_DEBUG=false`
- [ ] `DIRECT_URL` present, so migrations do not run through PgBouncer
- [ ] `NEXT_PUBLIC_API_URL` set on Vercel and the frontend redeployed
- [ ] HTTPS configured at Caddy
- [ ] The platform's PostgreSQL backups cover the `f1_api` database, and a
      restore has been rehearsed at least once
- [ ] Host firewall allows only 80/443 publicly (SSH rides the tailnet)
- [ ] `/api/health/db` monitored by an uptime check
- [ ] The tailnet policy's `ssh` rule for `tag:ci` says `accept`, not `check`
- [ ] Dependencies reviewed: `pnpm audit`, `uv run pip-audit`

---

## Database Backup & Restore

**On the VPS, backups belong to the platform.** The `f1_api` database lives on
the shared PostgreSQL cluster, so it is covered by whatever the box already runs
for every app — this repository ships no backup script or timer for it. Confirm
`f1_api` is in that scope, and rehearse a restore once.

Locally, backups are gzipped **data-only** dumps (the schema belongs to Alembic,
and `alembic_version` is excluded so restores never conflict):

```bash
./scripts/db-backup.sh                 # writes docker/backups/
./scripts/db-restore.sh                # restore the latest backup (prompts)
./scripts/db-restore.sh path/to.sql.gz # restore a specific file
```

`db-restore.sh` migrates, loads the data and rebuilds the materialized views the
career-stats, records and champions endpoints read from — those are created by
the ingest rather than by Alembic, and `pg_dump --data-only` does not carry them.
Useful overrides: `FORCE=1` (skip the confirmation), `SKIP_MIGRATE=1`,
`SKIP_VIEWS=1`, `BACKUP_DIR`, `BACKUP_KEEP_LAST`, `DB_CONTAINER`/`STACK_NAME`.

The committed `docker/backups/latest.sql.gz` carries no `lap_times` or qualifying
sector times — see `docker/backups/README.md`.

---

## Data Updates

New race data has to be ingested after each race weekend.

### On the VPS (scheduled)

`.github/workflows/ingest.yml` fires Mondays at 06:00 UTC, joins the tailnet and
runs `/srv/apps/f1_api/ingest.sh` (placed there by the deploy), which:

1. **Calendar gate** — `pipeline/scripts/should_ingest.py --exit-code` skips the
   run unless a race ran in the last 3 days, so off-weekends cost nothing. It
   fails *open*: if the schedule can't be fetched, it ingests anyway.
2. **Ingest** — runs the `ingest` compose service (the API image, `seed.py` with
   `--current-year --no-restore --no-backup`) against `DIRECT_URL`, bypassing
   PgBouncer. The ingestors are idempotent (`db.merge`), so re-runs are safe.
3. **Validate** — `scripts/validate.py`, informational.
4. **Purge** — POSTs to `REVALIDATE_URL` so Vercel drops its cached pages.
5. **Report** — prints how many races are still missing Fast-F1 data into the
   run's job summary. Nothing schedules that fetch, so this is the reminder.

Manual runs:

```bash
/srv/apps/f1_api/ingest.sh                            # calendar-gated
/srv/apps/f1_api/ingest.sh --force                    # ignore the gate
/srv/apps/f1_api/ingest.sh --force -- --results --current-year   # custom seed flags
```

Or from the Actions tab: **ingest → Run workflow**, with optional `force` and
`flags` inputs. **deploy → Run workflow → ingest** does the same after a deploy.

> Every f1db ingestor writes to PostgreSQL only, so the scheduled run needs
> nothing committed back to the repo. The f1db archive is cached on the
> `f1_api_f1db_cache` volume.

**Not on this path: lap times and qualifying sector times.** Formula 1 blocks
the VPS's datacentre IP, so `--laptimes` and `--qualifying-sectors` cannot run
there at all, and no workflow can stand in for it either — see below.

### Fast-F1 data (lap times, qualifying sectors)

Fast-F1 reads Formula 1's live timing archive, and `livetiming.formula1.com`
answers datacentre IPs with a 403. The VPS is in one — and so are GitHub's
runners, which was measured rather than assumed:

```
Checking Fast-F1's sources from this host...      (ubuntu-latest)
  live timing archive:      HTTP 403 — <!DOCTYPE HTML ...>
  Jolpica/Ergast (control): HTTP 200
```

A residential connection still works, so the fetch runs on a laptop and only
the database half runs on the box:

```
your machine                                 VPS
                     fastf1.sh status  ──▶   what is still missing? (JSON)
  fastf1_fetch.py  ◀──────────────────────
  payload.ndjson.gz ──▶ fastf1.sh import ─▶  fastf1_import.py → PostgreSQL
                                             → validate → purge Vercel cache
```

One command does all three:

```bash
pnpm fastf1
```

Set the server's tailnet address in `.env` once and it takes no arguments:

```bash
VPS_HOST=100.x.y.z        # VPS_USER defaults to hugo
```

`scripts/fastf1-sync.sh` is the script behind it, if you would rather not go
through pnpm; `VPS_HOST=… pnpm fastf1` or `--host` override the `.env` value.

Run it after a race weekend, once the Monday ingest has created the race rows —
that run's job summary reports how many races are waiting, since nothing
schedules this. Useful variants:

```bash
pnpm fastf1 --all                            # everything missing (hours; safe to stop)
pnpm fastf1 --limit 24 --oldest-first        # chip away at the backfill
pnpm fastf1 --need laps --year-range 2018-2019
pnpm fastf1 --dry-run                        # fetch, but write nothing
pnpm fastf1 --probe                          # can this machine fetch at all?
```

Each session costs ~45 s of rate-limit throttle, so a full 2018-onward backfill
is hours of wall clock. It does not have to happen in one sitting: the payload
is written as it is fetched, Ctrl-C is safe, and the next run asks the server
what is *still* missing.

The three steps are also available separately, which is what to reach for when
something goes wrong:

```bash
ssh hugo@<vps> '/srv/apps/f1_api/fastf1.sh status --limit 10' > targets.json
cd pipeline
uv run python scripts/fastf1_fetch.py --targets targets.json --out payload.ndjson.gz
ssh hugo@<vps> '/srv/apps/f1_api/fastf1.sh import' < payload.ndjson.gz
```

The payload is newline-delimited JSON (gzipped), one line per session, streamed
as it is fetched — a run stopped by the rate limit or a Ctrl-C still produces a
file worth importing, and the importer is idempotent, so re-running it changes
nothing. Sessions are keyed by year/round and three-letter driver code; the
importer resolves both against the live database, so no database credentials
or ids ever leave the server. Payloads are kept in `.fastf1_payloads/`
(gitignored) so a failed import can be retried without re-fetching.

> **If a fetch produces nothing.** Fast-F1 does not raise when it is refused —
> it logs a one-line warning per source and hands back an empty session. Three
> empty sessions in a row therefore stop the run with a blocked-host message,
> and `--probe` prints the HTTP status codes behind it. If your own connection
> starts returning 403, the fetch has to move to one that does not.

### Locally

```bash
cd pipeline
uv run python scripts/seed.py --base --layouts --colors --results --qualifying --sprints --standings --pitstops --postprocess
cd .. && ./scripts/db-backup.sh
```

> The dataset is one f1db release download per run, cached in `F1DB_CACHE_DIR`
> — no rate limit. Set `F1DB_VERSION` to a release tag for a reproducible seed,
> or leave it at `latest`.

Locally there is no IP block, so `seed.py --laptimes --qualifying-sectors` still
fetches and writes in one step, against the local database. Sessions are cached
in `FASTF1_CACHE_DIR` and throttled to stay within Fast-F1's ~500 calls/hour
window, so a backfill takes ~45 s per session. To put that data on the *server*,
use the payload path above rather than restoring a local dump over it.

---

## CI/CD

`.github/workflows/ci.yml` runs on pushes and PRs to `master`:

**Frontend**: `pnpm audit` (non-blocking) → `format:check` → `lint` → `typecheck` → `build`.

**Backend** (with a PostgreSQL 16 service container): `ruff check` → `ruff format
--check` → `pip-audit` (non-blocking) → `pytest`.

**Backend image**: builds `pipeline/Dockerfile` and smoke-tests it, so a broken
Dockerfile fails in CI instead of on the server.

### Deploying

`.github/workflows/deploy.yml` deploys the backend on every push to `master`
that touches `pipeline/`, `docker/compose.prod.yml`, `scripts/vps/` or the
workflow itself, and on demand from the Actions tab (with an optional **ingest**
checkbox). It:

1. builds `ghcr.io/hugoogb/f1_api` for `linux/amd64` and pushes it tagged with
   the commit SHA and `latest`
2. joins the tailnet as an ephemeral node tagged `tag:ci`
3. ships `docker-compose.yml`, `ingest.sh`, `fastf1.sh` and `purge-cache.sh`
   into `/srv/apps/f1_api/`
4. writes `TAG=<sha>` to `.tag`, pulls, runs migrations, `up -d --wait`, and
   verifies `/api/health/db`

Deploys are serialised with a `concurrency` group, and never cancelled in
flight — a half-applied migration is worse than waiting.

**There is no SSH key.** The server runs Tailscale SSH, which owns port 22 on the
tailnet address and authenticates by tailnet identity rather than
`authorized_keys`; a key would be ignored. Access is granted by the `ssh` rule in
the tailnet policy file saying `tag:ci` may SSH to `tag:server` as `hugo`, so
revoking CI means editing that rule or deleting the OAuth client. The three
repository secrets are `VPS_HOST`, `TS_OAUTH_CLIENT_ID` and `TS_OAUTH_SECRET` —
no database credentials go to GitHub; `.env` stays on the server, and the server
pulls from GHCR with its own stored credentials.

The equivalent by hand, which is also the fallback if Actions is unavailable:

```bash
cd /srv/apps/f1_api
echo "TAG=<sha>" > .tag
docker compose --env-file .env --env-file .tag pull
docker compose --env-file .env --env-file .tag run --rm migrate
docker compose --env-file .env --env-file .tag up -d --wait
```

### Rollback

Deploys are tagged by commit SHA, so rolling back needs neither CI nor a
rebuild — the image is already in GHCR:

```bash
cd /srv/apps/f1_api
echo "TAG=<previous-sha>" > .tag
docker compose --env-file .env --env-file .tag pull
docker compose --env-file .env --env-file .tag up -d --wait
```

A rollback across a schema change is not automatic — the deploy never runs
Alembic downgrades. Check whether the range you are rolling back over contains a
migration.

The frontend deploys independently: Vercel builds from the same push.

**Pre-commit hooks**: Husky runs Prettier on staged TS/config files via
lint-staged, and `ruff check` + `ruff format --check` on staged Python files.

---

## Operations cheat sheet

On the box, everything goes through the same two env files:

```bash
cd /srv/apps/f1_api
dc() { docker compose --env-file .env --env-file .tag "$@"; }

dc ps                      # what's running, and its health
dc logs -f --tail 100      # follow the API
dc exec -T f1_api curl -fsS http://127.0.0.1:8000/api/health/db

./ingest.sh --force        # ingest now, ignoring the calendar gate

dc run --rm -T --entrypoint python ingest scripts/validate.py </dev/null  # data completeness
dc run --rm -T migrate </dev/null                                         # re-run migrations
```

`</dev/null` on `compose run` is not decoration: it attaches stdin, so without
it a `run` inside a piped or heredoc'd script eats the rest of that script.

---

## Troubleshooting

### Database connection issues

```bash
docker compose -f docker/docker-compose.yml ps        # local
docker compose -f docker/docker-compose.yml logs db
docker exec f1-tracker-db pg_isready -U f1tracker

# VPS
cd /srv/apps/f1_api
docker compose --env-file .env --env-file .tag ps
docker compose --env-file .env --env-file .tag logs f1_api
docker compose --env-file .env --env-file .tag exec -T f1_api \
  curl -fsS http://127.0.0.1:8000/api/health/db
```

### Reset the local database

```bash
docker compose -f docker/docker-compose.yml down -v
./scripts/bootstrap.sh
```

### API container won't start

```bash
cd /srv/apps/f1_api
dc() { docker compose --env-file .env --env-file .tag "$@"; }

dc logs f1_api    # usually a missing CORS_ORIGINS in .env
dc config         # check the resolved DATABASE_URL, DIRECT_URL and image tag
dc run --rm migrate   # a failed migration is its own step, so re-run it alone
```

### 502 from Caddy

Bisect it — each step rules out everything before it:

```bash
cd /srv/apps/f1_api
docker compose --env-file .env --env-file .tag ps   # 1. does the container exist?
docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' f1_api  # 2. data AND edge?
docker exec caddy wget -qO- http://f1_api:8000/api/health                              # 3. can Caddy reach it?
docker exec caddy caddy adapt --config /etc/caddy/Caddyfile 2>/dev/null | grep -o 'f1_api:[0-9]*'  # 4. what port?
docker logs caddy --tail 5                                                             # 5. the actual error
```

- **Empty `ps`** — nothing is running; redeploy.
- **`connection refused`** — resolving fine, wrong port. Caddy must say
  `f1_api:8000`; `new-app.sh` writes `:3000` from the platform's Node template.
- **`no such host` / `server misbehaving`** — the container is not on `edge`, or
  Caddy's DNS cache is stale (`docker restart caddy`).
- **Step 3 returns `{"status":"ok"}` but step 4 still shows the old port** —
  `caddy adapt` reads from disk, so the file you edited is not the one at
  `/etc/caddy/Caddyfile` inside the container. Check
  `docker inspect -f '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}' caddy`.

### `/api/health/db` returns 503 while `/api/health` is 200

The API is up but cannot reach PostgreSQL. `dc logs f1_api` names it:

- **`could not translate host name "pgbouncer"`** — not on the `data` network.
  Set `SHARED_NETWORK` in `.env` if this box names it something else.
- **`invalid connection option "pgbouncer"`** — `DATABASE_URL` carries Prisma
  query parameters (`?pgbouncer=true&connection_limit=1`). `new-app.sh` writes
  those for its Node template; libpq rejects them. Strip the query string.
- **Connection refused** — wrong port. PgBouncer here listens on 5432.

`DIRECT_URL` is used by migrate and ingest and is normally clean, so migrations
succeeding while the API fails points squarely at `DATABASE_URL`.

### Frontend build fails

Next.js 16 requires `NODE_ENV=production` during build; that's already set in
`apps/web/package.json`. If it still fails: `NODE_ENV=production pnpm build`.

### Backend won't start locally

```bash
lsof -i :8000
cd pipeline && uv run python -c "from src.config import settings; print(settings.database_url)"
cd pipeline && uv run uvicorn src.api.main:app --reload --log-level debug
```

### Tests fail

```bash
cd pipeline && uv run pytest -v --tb=short
uv run pytest tests/test_races.py -v      # a single file
```

Tests use SQLite in-memory — no PostgreSQL needed.
