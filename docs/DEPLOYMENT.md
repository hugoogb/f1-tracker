# Deployment Guide

How to run F1 Tracker locally and in production.

Production is **Next.js on Vercel + a self-hosted VPS running the API and
PostgreSQL in Docker**. Migrating an existing Render/Neon deployment to that
setup is a separate, step-by-step document: [VPS_MIGRATION.md](VPS_MIGRATION.md).

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
                    │  │ Reverse proxy (Caddy/nginx/Traefik)│  │
                    │  └────────────┬───────────────────────┘  │
                    │               │ 127.0.0.1:8000           │
                    │  ┌────────────▼──────────┐               │
                    │  │ f1-tracker-api        │  FastAPI      │
                    │  └────────────┬──────────┘               │
                    │               │ f1-tracker_internal      │
                    │  ┌────────────▼──────────┐               │
                    │  │ f1-tracker-db         │  PostgreSQL   │
                    │  └───────────────────────┘  (no host port)│
                    └──────────────────────────────────────────┘
```

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

Docker Engine 24+ with the Compose v2 plugin, a reverse proxy, and a DNS record
for the API. Nothing else — Python, uv and Node are not needed on the server.

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
| `FASTF1_CACHE_DIR`    | `.fastf1_cache`                                                 | Fast-F1 cache directory                         |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000/api`                                     | Backend URL, baked into the bundle at build time |
| `REVALIDATE_URL` / `REVALIDATE_SECRET` | —                                              | Frontend cache purge after ingest               |

### `.env.prod` (VPS — template: `docker/.env.prod.example`)

| Variable                | Required | Description                                                     |
| ----------------------- | -------- | --------------------------------------------------------------- |
| `STACK_NAME`            |          | Prefix for containers/volumes/network (default `f1-tracker`)      |
| `POSTGRES_PASSWORD`     | ✅       | Database password — alphanumerics only (it is interpolated into a URL) |
| `CORS_ORIGINS`          | ✅       | Your Vercel origin(s), comma-separated, no trailing slash        |
| `DATABASE_URL`          |          | Only to target a database outside the stack; otherwise derived    |
| `FASTAPI_DEBUG`         |          | `false` in production — keeps the OpenAPI docs off               |
| `API_WORKERS`           |          | uvicorn workers (default 2)                                      |
| `API_BIND` / `API_PORT` |          | Loopback bind for a host reverse proxy (default `127.0.0.1:8000`) |
| `API_DOMAIN`, `PROXY_NETWORK`, `TRAEFIK_*` |  | Only with the Traefik overlay                    |
| `DB_MEMORY_LIMIT` / `API_MEMORY_LIMIT` | | Container memory caps (default 1g each)            |
| `REVALIDATE_URL` / `REVALIDATE_SECRET` | | Cache purge after a successful ingest              |

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

### Running the backend in Docker locally

The production image builds and runs anywhere:

```bash
cp docker/.env.prod.example .env.prod   # set POSTGRES_PASSWORD + CORS_ORIGINS
docker compose --env-file .env.prod -f docker/compose.prod.yml up -d --build
curl http://127.0.0.1:8000/api/health/db
```

---

## Production: Vercel + VPS

Full walkthrough — including moving data off Neon — in
[VPS_MIGRATION.md](VPS_MIGRATION.md). The short version:

### 1. Backend on the VPS

```bash
git clone https://github.com/hugoogb/f1-tracker.git /opt/f1-tracker
cd /opt/f1-tracker
cp docker/.env.prod.example .env.prod && chmod 600 .env.prod && $EDITOR .env.prod
./scripts/vps/deploy.sh
```

`deploy.sh` builds the image, starts the stack, runs migrations through the
one-shot `migrate` service, and waits for `/api/health/db` before reporting
success.

### 2. Load the data

```bash
NEON_DATABASE_URL='postgresql://…' ./scripts/vps/migrate-from-neon.sh
# …or, from the repo's bundled backup:
FORCE=1 SKIP_MIGRATE=1 ./scripts/db-restore.sh docker/backups/latest.sql.gz
```

### 3. Reverse proxy

Copy a sample from `deploy/caddy/` or `deploy/nginx/`, replace the hostname, and
reload. For a containerised Traefik, set `API_DOMAIN` and `PROXY_NETWORK` in
`.env.prod` and deploy with `TRAEFIK=1 ./scripts/vps/deploy.sh`.

### 4. Frontend on Vercel

| Setting              | Value                                    |
| -------------------- | ---------------------------------------- |
| **Root Directory**   | `apps/web`                               |
| **Framework Preset** | `Next.js` (auto-detected)                |

| Variable              | Value                                     |
| --------------------- | ----------------------------------------- |
| `NEXT_PUBLIC_API_URL` | `https://f1-api.your-domain.com/api`      |
| `REVALIDATE_SECRET`   | Same value as in `.env.prod`              |

Redeploy after changing `NEXT_PUBLIC_API_URL` — it is compiled into the bundle.

### 5. Verify

```bash
curl https://f1-api.your-domain.com/api/health      # {"status":"ok"}
curl https://f1-api.your-domain.com/api/health/db   # {"status":"ok","database":"ok"}
curl https://f1-api.your-domain.com/api/stats       # row counts
```

---

## Sharing the VPS with other projects

Every object the stack creates is prefixed with `STACK_NAME` (default
`f1-tracker`): the compose project, the containers (`f1-tracker-api`,
`f1-tracker-db`, `f1-tracker-migrate`, `f1-tracker-ingest`), the volumes
(`f1-tracker_pgdata`, `f1-tracker_fastf1_cache`), the private network
(`f1-tracker_internal`), the image (`f1-tracker-api`) and the systemd units. Every
container, volume and network also carries `com.f1tracker.stack=f1-tracker`:

```bash
docker ps --filter label=com.f1tracker.stack=f1-tracker
```

PostgreSQL publishes **no** host port — only this project's containers can reach
it. The API binds to loopback on `API_PORT`; give each project on the box its own
port, or use the Traefik overlay, which publishes no host port at all. Container
logs are capped (10 MB × 3) and both containers have memory limits, so one
project can't starve the others.

Running a second copy (e.g. staging) is a matter of a second env file with a
different `STACK_NAME` and `API_PORT`.

---

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

- [ ] `POSTGRES_PASSWORD` set to a generated value (not the dev default)
- [ ] `.env.prod` is `chmod 600` and gitignored
- [ ] `FASTAPI_DEBUG=false`
- [ ] `CORS_ORIGINS` limited to your frontend domain(s)
- [ ] `NEXT_PUBLIC_API_URL` set on Vercel and the frontend redeployed
- [ ] HTTPS configured at the reverse proxy
- [ ] `f1-tracker-backup.timer` enabled, and a restore rehearsed at least once
- [ ] `f1-tracker-ingest.timer` enabled
- [ ] Host firewall allows only 22/80/443
- [ ] `/api/health/db` monitored by an uptime check
- [ ] Dependencies reviewed: `pnpm audit`, `uv run pip-audit`

---

## Database Backup & Restore

Backups are gzipped **data-only** dumps (the schema belongs to Alembic, and
`alembic_version` is excluded so restores never conflict).

```bash
./scripts/db-backup.sh                 # local; writes docker/backups/
./scripts/vps/backup.sh                # VPS; writes /var/backups/f1-tracker/
./scripts/db-restore.sh                # restore the latest backup (prompts)
./scripts/db-restore.sh path/to.sql.gz # restore a specific file
```

Both scripts resolve the target container from `STACK_NAME`/`DB_CONTAINER`
(`scripts/lib/db.sh`), so the same scripts work locally and on the VPS. Useful
overrides: `FORCE=1` (skip the confirmation), `SKIP_MIGRATE=1` (don't shell out to
`alembic`, which isn't installed on the VPS host), `BACKUP_DIR`, `BACKUP_KEEP_LAST`.

On the VPS, backups must live **outside** the git checkout — `docker/backups/
latest.sql.gz` is tracked in git, and writing there breaks `git pull`.
`scripts/vps/backup.sh` defaults to `/var/backups/f1-tracker` for that reason.

### Scheduled backups

`deploy/systemd/f1-tracker-backup.timer` runs nightly at 03:30 and keeps 14 dumps:

```bash
sudo cp deploy/systemd/f1-tracker-*.service deploy/systemd/f1-tracker-*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now f1-tracker-backup.timer
```

---

## Data Updates

New race data has to be ingested after each race weekend.

### On the VPS (scheduled)

`deploy/systemd/f1-tracker-ingest.timer` fires Mondays at 06:00.
`scripts/vps/ingest.sh` then:

1. **Calendar gate** — `pipeline/scripts/should_ingest.py --exit-code` skips the
   run unless a race ran in the last 3 days, so off-weekends cost nothing. It
   fails *open*: if the schedule can't be fetched, it ingests anyway.
2. **Ingest** — runs the `ingest` compose service (the API image, `seed.py` with
   `--current-year --no-restore --no-backup`) against the stack's PostgreSQL. The
   ingestors are idempotent (`db.merge`), so re-runs are safe.
3. **Validate** — `scripts/validate.py`, informational.
4. **Purge** — POSTs to `REVALIDATE_URL` so Vercel drops its cached pages.

Manual runs:

```bash
./scripts/vps/ingest.sh                              # calendar-gated
./scripts/vps/ingest.sh --force                      # ignore the gate
./scripts/vps/ingest.sh --force -- --laptimes --current-year   # custom seed flags
sudo journalctl -u f1-tracker-ingest.service -n 100
```

> **Images are not part of this.** The `--images`, `--logos` and `--layouts`
> ingestors write into `apps/web/public/`, which Vercel serves from the git repo.
> Run those locally and commit the result; see
> [VPS_MIGRATION.md](VPS_MIGRATION.md#images-are-still-a-local-committed-job).

### Locally

```bash
cd pipeline
uv run python scripts/seed.py --base --results --qualifying --standings --pitstops --sprints --postprocess
cd .. && ./scripts/db-backup.sh
```

> Fast-F1 caches downloads in `FASTF1_CACHE_DIR`, so repeat runs only fetch what's
> new. Jolpica-F1 (used internally) is rate-limited to 200 requests/hour.

---

## CI/CD

`.github/workflows/ci.yml` runs on pushes and PRs to `master`:

**Frontend**: `pnpm audit` (non-blocking) → `format:check` → `lint` → `typecheck` → `build`.

**Backend** (with a PostgreSQL 16 service container): `ruff check` → `ruff format
--check` → `pip-audit` (non-blocking) → `pytest`.

**Backend image**: builds `pipeline/Dockerfile` and smoke-tests it, so a broken
Dockerfile fails in CI instead of on the server.

Deployment itself is a pull on the VPS:

```bash
cd /opt/f1-tracker && ./scripts/vps/deploy.sh --pull
```

**Pre-commit hooks**: Husky runs Prettier on staged TS/config files via
lint-staged, and `ruff check` + `ruff format --check` on staged Python files.

---

## Troubleshooting

### Database connection issues

```bash
docker compose -f docker/docker-compose.yml ps        # local
docker compose -f docker/docker-compose.yml logs db
docker exec f1-tracker-db pg_isready -U f1tracker

# VPS
docker compose --env-file .env.prod -f docker/compose.prod.yml ps
docker compose --env-file .env.prod -f docker/compose.prod.yml logs db api migrate
```

### Reset the local database

```bash
docker compose -f docker/docker-compose.yml down -v
./scripts/bootstrap.sh
```

### API container won't start

```bash
dc logs migrate   # a failed migration blocks the API — it depends on migrate
dc logs api
dc config         # check the resolved DATABASE_URL and CORS_ORIGINS
```

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
