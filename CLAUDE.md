# F1 Tracker

## Project Overview

F1 analytics dashboard covering the complete history of Formula 1 (1950-present) with interactive visualizations and driver comparisons. Full-stack: Next.js frontend + Python FastAPI backend + PostgreSQL.

Deployment: frontend on Vercel; the API runs as a Docker container (`f1_api`) on a self-hosted VPS shared with other projects, against that platform's shared PostgreSQL (see `docs/DEPLOYMENT.md`).

## Tech Stack

- **Frontend**: Next.js 16 (App Router), TypeScript, Tailwind CSS 4, shadcn/ui, Recharts
- **Backend**: Python 3.12, FastAPI, SQLAlchemy 2, Alembic
- **Database**: PostgreSQL 16 (via Docker Compose, local and production)
- **Data Source**: f1db release artifacts (1950-present) + Fast-F1 (session timing, 2018+)
- **Package Managers**: pnpm (frontend), uv (Python)

## Project Structure

- `apps/web/` - Next.js frontend (15 routes, 36+ components)
- `pipeline/` - Python data pipeline + FastAPI backend (11 routers, 38 endpoints); `Dockerfile` builds the API/migrate/ingest image
- `docker/` - `docker-compose.yml` (local dev DB), `compose.prod.yml` (the VPS stack — shipped to `/srv/apps/f1_api/docker-compose.yml` by the deploy), `.env.prod.example`, backups
- `scripts/` - `bootstrap.sh`, `db-backup.sh`, `db-restore.sh`, `lib/db.sh` (shared container resolution), `vps/ingest.sh`, `vps/fastf1.sh`, `vps/purge-cache.sh` (copied to the VPS by the deploy)

### Frontend Routes

| Route | Description |
|-------|-------------|
| `/` | Home dashboard (stats, standings, race calendar, next race countdown) |
| `/seasons` | Season list |
| `/seasons/[year]` | Season detail (standings + charts + championship progression) |
| `/seasons/[year]/races/[round]` | Race detail (results, qualifying, sprint, pit stops) |
| `/drivers` | Driver list (filterable by nationality) |
| `/drivers/[ref]` | Driver profile (stats incl. poles/fastest laps/championships, career chart, season history) |
| `/constructors` | Constructor list (filterable by nationality) |
| `/constructors/[ref]` | Constructor profile (stats, career chart, season history, roster) |
| `/circuits` | Circuit list (filterable by country) |
| `/circuits/[ref]` | Circuit detail (location, race history) |
| `/champions` | All-time champions |
| `/records` | All-time records (most wins, poles, podiums, championships, fastest laps, starts) |
| `/compare` | Driver and constructor comparison selector |
| `/compare/drivers` | Side-by-side driver comparison |
| `/compare/constructors` | Side-by-side constructor comparison |
| `/attributions` | Data sources, licences, trademark notice (compliance) |

### Frontend Components

- `components/ui/` - shadcn/ui base components (badge, button, card, table, tabs, sheet, dialog, dropdown-menu, country-flag, driver-avatar, constructor-logo, empty-state, motion, page-header, position-badge, sonner, stat-card, next-race-countdown)
- `components/layout/` - Header, footer, mobile nav, breadcrumbs, search dialog, theme toggle, nav link
- `components/charts/` - Recharts visualizations (points bar, constructor points, career line, comparison line, championship progression, season heatmap, quali-vs-race, driver radar)
- `components/races/` - Race result tables (results with position change indicators, qualifying, sprint, pit stops, lap-times-chart, tyre-strategy-chart, position-chart, pit-stop-analysis, podium-card, fastest-lap-card)
- `components/standings/` - Driver + constructor standings tables
- `components/drivers/` - Driver season history table
- `components/constructors/` - Constructor season history table
- `components/circuits/` - Track layout, world map, world map wrapper
- `components/compare/` - Driver select, constructor select, head-to-head-card, career-stats-table
- `components/providers/` - Theme provider
- Root: pagination, list-filter, error-boundary

### Backend Endpoints

- `GET /api/health` - Liveness check (used by the container HEALTHCHECK)
- `GET /api/health/db` - Readiness check (verifies PostgreSQL connectivity; 503 when unreachable)
- `GET /api/stats` - DB statistics (counts of seasons, drivers, constructors, races, circuits)
- `GET /api/seasons` / `GET /api/seasons/{year}` - Seasons
- `GET /api/seasons/{year}/standings/drivers` / `constructors` - Standings
- `GET /api/seasons/{year}/races/{round}` - Race results
- `GET /api/seasons/{year}/races/{round}/qualifying` - Qualifying
- `GET /api/seasons/{year}/races/{round}/sprint` - Sprint results (2021+)
- `GET /api/seasons/{year}/races/{round}/pitstops` - Pit stops (1994+)
- `GET /api/seasons/{year}/races/{round}/pitstops/analysis` - Pit stop analysis (1994+)
- `GET /api/seasons/{year}/races/{round}/positions` - Lap-by-lap positions (2018+)
- `GET /api/seasons/{year}/races/{round}/laps` - Lap times + tyre strategy (2018+)
- `GET /api/drivers` - Drivers (pagination + nationality filter)
- `GET /api/drivers/nationalities` - Distinct nationalities
- `GET /api/drivers/{ref}` - Driver detail with career stats
- `GET /api/drivers/{ref}/seasons` - Driver season-by-season history
- `GET /api/drivers/{ref}/pace` - Qualifying vs race pace per season
- `GET /api/constructors` - Constructors (pagination + nationality filter)
- `GET /api/constructors/nationalities` - Distinct nationalities
- `GET /api/constructors/{ref}` - Constructor detail with career stats
- `GET /api/constructors/{ref}/seasons` - Constructor season-by-season history
- `GET /api/constructors/{ref}/roster` - Driver roster (optional year param)
- `GET /api/circuits` - Circuits (pagination + country filter)
- `GET /api/circuits/countries` - Distinct countries
- `GET /api/circuits/{ref}` - Circuit detail with race history
- `GET /api/circuits/{ref}/stats` - Circuit performance stats (most wins, poles, history)
- `GET /api/champions` - All championship winners
- `GET /api/search?q={query}` - Search drivers, constructors, circuits
- `GET /api/compare/drivers?d1={ref}&d2={ref}&teammate=bool` - Driver comparison with H2H, quali H2H, radar stats
- `GET /api/compare/constructors?c1={ref}&c2={ref}` - Constructor comparison with head-to-head
- `GET /api/records` - All-time records (most wins, poles, podiums, championships, etc.)
- `GET /api/seasons/{year}/standings/progression` - Round-by-round championship progression
- `GET /api/seasons/{year}/heatmap` - Season results heatmap (driver × round grid)

## Commands

### Local setup (from root)
- `./scripts/bootstrap.sh` - One-command setup: `.env` + DB + migrations + restore backup + frontend deps

### Frontend (from root)
- `pnpm dev` - Start Next.js dev server
- `pnpm build` - Build for production
- `pnpm lint` - Run ESLint

### Backend (from `pipeline/`)
- `uv run uvicorn src.api.main:app --reload` - Start FastAPI dev server
- `uv run alembic upgrade head` - Run database migrations
- `uv run alembic revision --autogenerate -m "description"` - Generate migration
- `uv run python scripts/seed.py` - Run data ingestion (locally this includes `--laptimes` / `--qualifying-sectors`; on the VPS those two cannot run — see below)
- `uv run python scripts/fastf1_fetch.py --probe` - Check whether this host may talk to Fast-F1 at all
- `uv run python scripts/fastf1_fetch.py --targets targets.json --out payload.ndjson.gz` - Fetch Fast-F1 sessions into a payload (no DB needed)
- `uv run python scripts/fastf1_status.py` - List races still missing Fast-F1 data, as JSON (DB, no network)
- `uv run python scripts/fastf1_import.py --payload payload.ndjson.gz` - Load a payload into PostgreSQL (DB, no network)
- `uv run python scripts/refresh_views.py` - Rebuild the computed-stats materialized views (`driver_career_stats`, `constructor_career_stats`, `season_champions`); `db-restore.sh` calls this, since the dump does not carry view contents
- `uv run pytest -v` - Run backend tests (120 tests)
- `uv run ruff check . && uv run ruff format --check .` - Lint + format check

### VPS (production backend)
- App name is `f1_api` everywhere: compose project, container, database, GHCR image. It lives at `/srv/apps/f1_api` on the box
- Deploys: push to `master`, or Actions -> deploy -> Run workflow (optional `ingest` input). CI builds the image and the server pulls it — nothing is built on the VPS and the repo is not checked out there
- `/srv/apps/f1_api/ingest.sh [--force] [-- <seed flags>]` - Calendar-gated f1db ingest + Vercel cache purge; copied there by the deploy
- `/srv/apps/f1_api/fastf1.sh status|import` - The database half of the Fast-F1 path: report what is missing (JSON on stdout), or load a payload arriving on stdin. Formula 1 blocks the VPS's IP, so nothing here fetches from Fast-F1
- Manual deploy/rollback on the box: `echo "TAG=<sha>" > .tag`, then `docker compose --env-file .env --env-file .tag pull && ... run --rm migrate && ... up -d --wait`
- Env file: `/srv/apps/f1_api/.env` (created by the platform's `new-app.sh`; app-specific keys in `docker/.env.prod.example`) plus `.tag`, which carries only `TAG=<sha>`
- Database is the platform's shared PostgreSQL: the API uses `DATABASE_URL` (PgBouncer), migrations and ingest use `DIRECT_URL` (direct — transaction pooling cannot run a migration). Backups are the platform's job
- Scheduling: `.github/workflows/ingest.yml` — Mondays 06:00 UTC, calendar-gated inside `ingest.sh`; run it by hand from the Actions tab with optional `force`/`flags` inputs

### Data Updates
- **Automated (f1db)**: `.github/workflows/ingest.yml` runs Mondays 06:00 UTC — joins the tailnet and runs `/srv/apps/f1_api/ingest.sh` on the box, calendar-gated, straight into PostgreSQL, then purges the Vercel cache. The f1db ingestors upsert from one release download, so they can bootstrap an empty DB as well as update one.
- **Automated (Fast-F1)**: `.github/workflows/fastf1.yml` runs Mondays 07:30 UTC — asks the box what is missing (`fastf1.sh status`), fetches those sessions **on the runner** (`scripts/fastf1_fetch.py`, ~45 s each), ships the payload back and loads it (`fastf1.sh import`). Formula 1 blocks the VPS's datacentre IP, so lap times and qualifying sectors can only be fetched off-box; every run probes first, and a blocked runner fails loudly. The same two commands work from a laptop — see `docs/DEPLOYMENT.md`.
- `uv run python scripts/should_ingest.py --days 3 [--exit-code]` - Calendar gate; `--exit-code` makes the decision the exit status for shell callers
- `F1DB_VERSION` (env) - f1db release to ingest; `latest` by default, pin a tag for reproducible seeds

### Database
- `docker compose -f docker/docker-compose.yml up -d` - Start PostgreSQL (container `f1-tracker-db`)
- `docker compose -f docker/docker-compose.yml down` - Stop PostgreSQL
- `docker compose --env-file .env --env-file .tag <cmd>` - Production stack, run from `/srv/apps/f1_api` on the VPS

## Conventions

- Use conventional commits (feat:, fix:, docs:, refactor:, test:, chore:)
- Frontend: shadcn/ui components in `components/ui/`, feature components in `components/<feature>/`
- Backend: FastAPI routers in `src/api/routers/`, SQLAlchemy models in `src/db/models.py`
- Backend shared helpers: `src/api/constants.py` (magic numbers), `src/api/serializers.py` (driver/constructor dict builders), `src/api/pagination.py` (generic paginator)
- Fast-F1 code is split by what it needs: `src/ingestion/fastf1_sessions.py` is network-only (no DB import, so it runs on a host with no database), `src/ingestion/fastf1_payload.py` is the NDJSON wire format between the two hosts, and the writers (`write_lap_rows`, `write_quali_sectors`) are shared by the direct ingestors and the payload importer — keep it that way so the off-box path cannot drift from the local one
- All API endpoints prefixed with `/api/`
- Next.js frontend calls FastAPI at `NEXT_PUBLIC_API_URL` (default: http://localhost:8000/api)
- Dark-mode-first UI with F1 team colors
- Use `Promise.allSettled` for optional data fetching (graceful degradation)
- Client components (`'use client'`) only for interactive pieces (charts, filters, tabs, search)
- Pre-commit: Husky runs lint-staged (prettier) + ruff check/format on staged `.py` files
- CI: GitHub Actions `ci.yml` — frontend (audit, format, lint, typecheck, build) + backend (ruff, pip-audit, pytest) + backend image (docker build + smoke test)
- CD: GitHub Actions `deploy.yml` — on push to `master` touching `pipeline|docker/compose.prod.yml|scripts/vps`, builds and pushes `ghcr.io/hugoogb/f1_api:<sha>`, joins the tailnet as `tag:ci`, then over Tailscale SSH ships `docker-compose.yml`+`ingest.sh`+`fastf1.sh`+`purge-cache.sh`, pulls, migrates, `up -d --wait` and checks `/api/health/db`. Secrets are `VPS_HOST`/`TS_OAUTH_CLIENT_ID`/`TS_OAUTH_SECRET` — there is no SSH key (Tailscale SSH authenticates by tailnet identity), and no DB credentials leave the server
- Docker naming: local dev is prefixed with `STACK_NAME` (default `f1-tracker`); on the VPS the platform's convention wins and everything is named `f1_api`, so the project stays distinguishable on a box running several apps
- Shell scripts resolve the DB container via `scripts/lib/db.sh` (`STACK_NAME`/`DB_CONTAINER`) — never hardcode a container name

## Licensing & API Compliance

**Three sources, every obligation is attribution.** f1db (CC BY 4.0) supplies the dataset and the
circuit SVGs; Fast-F1 (MIT) supplies session timing from 2018; Natural Earth (public domain)
supplies the map. Nothing restricts commercial use or imposes share-alike. See `ATTRIBUTIONS.md`
for the inventory and `LICENSE-DATA.md` for the dataset licence.

Rules to preserve when changing code:

- **Never remove** the trademark disclaimer or data credits from `components/layout/footer.tsx` or
  the `/attributions` page.
- **No driver photos or team logos.** OpenF1, TheSportsDB and Wikimedia Commons were all removed;
  `DriverAvatar` and `ConstructorLogo` render initials on the team colour. Do not reintroduce an
  image source without adding a row to `ATTRIBUTIONS.md` — see its "Deliberately not used" table.
- **Map** uses bundled Natural Earth geometry (`public/geo/world.geo.json`, public domain), not
  raster basemap tiles. Do not add a `TileLayer` back: CARTO/OSM tiles require visible attribution
  and are non-commercial on the free tier.
- **Rate limits**: keep `THROTTLE_DELAY` (45s, Fast-F1 ~500 calls/hr) — it now lives in
  `src/ingestion/fastf1_sessions.py` and is re-exported from `base.py`. It applies wherever the
  fetch runs, CI included. f1db is a single release download, so it needs no throttling.
- **Standings** must keep using f1db's official points (`StandingsIngestor._apply_official`).
  Summing raw race points crowns the wrong champion in the pre-1991 "best N results" seasons.
- New data sources need a row in `ATTRIBUTIONS.md` and an entry in `DATA_SOURCES` on the
  attributions page before they ship.

## Next Phases

### Phase 3 — Advanced Features
- **Weather data** (2018+): Air/track temp, humidity, wind, rainfall from Fast-F1 — new `RaceWeather` model
- **Race control events** (2018+): Safety cars, flags, penalties — timeline overlay on lap times chart
- **Tyre degradation analysis**: Lap time vs tyre age per compound, derived from existing lap data
- **Gap analysis chart**: Time gaps between drivers throughout a race, computed from lap times
- **Telemetry visualization** (2018+): Speed/throttle/brake traces — on-demand from Fast-F1 cache (not stored in DB)
- **OpenF1 live data** (2023+): Real-time positions, intervals, team radio — WebSocket/SSE architecture

## Known Issues

- Next.js 16 build requires `NODE_ENV=production` to avoid `_global-error` prerender bug
- Renaming the local dev DB container (`docker-db-1` → `f1-tracker-db`) orphans the old `docker_pgdata` volume; re-run `./scripts/bootstrap.sh`, then `docker volume rm docker_pgdata`
- **Formula 1 blocks the VPS's IP for Fast-F1.** Lap times and qualifying sectors cannot be ingested on the server; they are fetched by `.github/workflows/fastf1.yml` (or a laptop) and imported as a payload. GitHub's runner ranges could be blocked next — the workflow probes on every run so that failure is unambiguous.
- `docker/backups/latest.sql.gz` carries no `lap_times` or qualifying sector times — those come from Fast-F1 at ~45 s/session, so they are not bundled. Race pages' lap-time, tyre-strategy and position charts stay empty until an ingest fills them in (`--laptimes --qualifying-sectors`, or the VPS timer)
