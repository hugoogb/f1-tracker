# F1 Tracker

## Project Overview

F1 analytics dashboard covering the complete history of Formula 1 (1950-present) with interactive visualizations and driver comparisons. Full-stack: Next.js frontend + Python FastAPI backend + PostgreSQL.

Deployment: frontend on Vercel; the API runs as a Docker container (`f1_api`) on a self-hosted VPS shared with other projects, against that platform's shared PostgreSQL (see `docs/DEPLOYMENT.md`).

## Tech Stack

- **Frontend**: Next.js 16 (App Router), TypeScript, Tailwind CSS 4, shadcn/ui, Recharts
- **Backend**: Python 3.12, FastAPI, SQLAlchemy 2, Alembic
- **Database**: PostgreSQL 17 — local dev via Docker Compose, production on the VPS platform's shared cluster. Keep the majors matching: a dump only loads into a server of the same or a later version
- **Data Source**: f1db release artifacts (1950-present) + Fast-F1 (session timing, 2018+)
- **Package Managers**: pnpm (frontend), uv (Python)

## Project Structure

- `apps/web/` - Next.js frontend (15 routes, 36+ components)
- `pipeline/` - Python data pipeline + FastAPI backend (11 routers, 38 endpoints); `Dockerfile` builds the API/migrate/ingest image
- `docker/` - `docker-compose.yml` (local dev DB), `compose.prod.yml` (the VPS stack — shipped to `/srv/apps/f1_api/docker-compose.yml` by the deploy), `.env.prod.example`, backups
- `scripts/` - `bootstrap.sh`, `db-backup.sh`, `db-restore.sh`, `seed-fetch.sh` (download the seed dump from its release), `fastf1-sync.sh` (laptop-side Fast-F1 fetch), `lib/db.sh` (shared container resolution + dump inspection + seed release location), `vps/ingest.sh`, `vps/fastf1.sh`, `vps/backup.sh`, `vps/purge-cache.sh` (copied to the VPS by the deploy)

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

Metadata routes (Next file conventions, all under `apps/web/app/`): `sitemap.ts`
(static routes + every season, driver, constructor, circuit and race, rebuilt
daily and on the `f1-data` tag purge), `robots.ts`, `manifest.ts`,
`opengraph-image.tsx` + `twitter-image.tsx` (1200x630 card via `next/og`),
`icon.svg`, `favicon.ico`, `apple-icon.png`.

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
- `components/seo/` - `json-ld.tsx` (renders a schema.org graph into a `<script type="application/ld+json">`)
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
- `GET /api/seasons/{year}/races/{round}/pitstops` - Pit stops (1994+), with time lost vs the race benchmark
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
- `./scripts/bootstrap.sh` - One-command setup: `.env` + DB + migrations + fetch and restore the seed dump + frontend deps
- `pnpm fastf1` - Fetch the Fast-F1 data the VPS is blocked from and load it there (status -> fetch -> import). Reads `VPS_HOST` from `.env`; flags: `--all`, `--limit`, `--need`, `--year-range`, `--oldest-first`, `--dry-run`, `--probe`, `--host`/`--user`. The script is `scripts/fastf1-sync.sh`

### Frontend (from root)
- `pnpm dev` - Start Next.js dev server
- `pnpm build` - Build for production
- `pnpm lint` - Run ESLint

### Backend (from `pipeline/`)
- `uv run uvicorn src.api.main:app --reload` - Start FastAPI dev server
- `uv run alembic upgrade head` - Run database migrations
- `uv run alembic revision --autogenerate -m "description"` - Generate migration
- `uv run python scripts/seed.py` - Run data ingestion (locally this includes `--laptimes` / `--qualifying-sectors`; on the VPS those two cannot run — see below)
- `uv run python scripts/fastf1_fetch.py --probe` - Check whether this host may talk to Fast-F1 at all (prints HTTP status for live timing and a control host)
- `uv run python scripts/fastf1_fetch.py --targets targets.json --out payload.ndjson.gz` - Fetch Fast-F1 sessions into a payload (no DB needed)
- `uv run python scripts/fastf1_status.py` - List races still missing Fast-F1 data, as JSON (DB, no network)
- `uv run python scripts/fastf1_import.py --payload payload.ndjson.gz` - Load a payload into PostgreSQL (DB, no network)
- `uv run python scripts/refresh_views.py` - Rebuild the computed-stats materialized views (`driver_career_stats`, `constructor_career_stats`, `season_champions`); `db-restore.sh` calls this after migrating
- `uv run pytest -v` - Run backend tests (120 tests)
- `uv run ruff check . && uv run ruff format --check .` - Lint + format check

### VPS (production backend)
- App name is `f1_api` everywhere: compose project, container, database, GHCR image. It lives at `/srv/apps/f1_api` on the box
- Deploys: push to `master`, or Actions -> deploy -> Run workflow (optional `ingest` input). CI builds the image and the server pulls it — nothing is built on the VPS and the repo is not checked out there
- `/srv/apps/f1_api/ingest.sh [--force] [-- <seed flags>]` - Calendar-gated f1db ingest + Vercel cache purge; copied there by the deploy
- `/srv/apps/f1_api/fastf1.sh status|import` - The database half of the Fast-F1 path: report what is missing (JSON on stdout), or load a payload arriving on stdin. Formula 1 blocks the VPS's IP, so nothing here fetches from Fast-F1
- `/srv/apps/f1_api/backup.sh > f1_api.sql.gz` - Dump the whole production database to stdout, from a throwaway postgres container on the shared network against `DIRECT_URL`. It asks the server its version first and pulls the matching `postgres:<major>-alpine`, because pg_dump refuses to dump a server newer than itself; `PG_IMAGE` pins one instead. Driven from a laptop by `pnpm db:backup:prod`
- Manual deploy/rollback on the box: `echo "TAG=<sha>" > .tag`, then `docker compose --env-file .env --env-file .tag pull && ... run --rm migrate && ... up -d --wait`
- Env file: `/srv/apps/f1_api/.env` (created by the platform's `new-app.sh`; app-specific keys in `docker/.env.prod.example`) plus `.tag`, which carries only `TAG=<sha>`
- Database is the platform's shared PostgreSQL: the API uses `DATABASE_URL` (PgBouncer), migrations and ingest use `DIRECT_URL` (direct — transaction pooling cannot run a migration). Backups are the platform's job
- Scheduling: `.github/workflows/ingest.yml` — Mondays 06:00 UTC, calendar-gated inside `ingest.sh`; run it by hand from the Actions tab with optional `force`/`flags` inputs. Its last step reports the Fast-F1 backlog, which is a manual job (`scripts/fastf1-sync.sh`)

### Weekend schedules and pit stop timing

Two f1db quirks the UI is built around:

- **Session times exist only for the seasons around the present day** (2024-2026
  at the time of writing) and always as a date/time pair in UTC. They are stored
  on `races` as `fp1_at`/`fp2_at`/`fp3_at`/`qualifying_at`/
  `sprint_qualifying_at`/`sprint_race_at` and served under `schedule` by
  `/api/seasons/{year}` and the race detail endpoint. `lib/schedule.ts` on the
  frontend orders them and picks the next one; a race with no schedule falls
  back to its calendar date, which is midnight UTC and therefore a day marker
  rather than a start time.
- **Lap-by-lap positions come from Fast-F1's own `Position`**, stored on
  `lap_times.position`. Races ingested before that column existed have NULLs,
  and `/positions` falls back to ranking drivers by cumulative lap time for
  them — which needs an unbroken chain from lap 1, so one missing lap time ends
  a driver's line there (the sum of the three sector times stands in where it
  can). Backfill the column with `pnpm fastf1 --refresh-positions --all` (or
  `seed.py --laptimes --refresh-positions` on a host Fast-F1 answers — both
  paths take the same flag and agree on what is outstanding); it re-fetches
  sessions at ~45s each, so it is a deliberate one-off, not part of the weekly
  run, which keeps skipping any race that already has laps. A session Fast-F1
  has no positions for at all is offered again by every `--refresh-positions`
  run, since nothing records the attempt. `/positions` returns `totalLaps` (the race) and `coveredLaps`
  (how far the data reaches) separately — never conflate them, or a race with
  patchy timing renders as a three-lap race.
- **A pit stop's `timeMillis` is pit *lane* time**, entry line to exit line with
  the stationary time included — there is no stationary time in the dataset.
  It runs from ~13s at Melbourne to ~24s at Bahrain, so it is dominated by the
  circuit. Everything comparative is therefore expressed as time lost against
  the quickest stop of the same race (`benchmark`), which is what isolates the
  crew. Do not reintroduce absolute duration buckets: they put every stop of a
  race in one bar.

### Data Updates
- **Automated (f1db)**: `.github/workflows/ingest.yml` runs Mondays 06:00 UTC — joins the tailnet and runs `/srv/apps/f1_api/ingest.sh` on the box, calendar-gated, straight into PostgreSQL, then purges the Vercel cache. The f1db ingestors upsert from one release download, so they can bootstrap an empty DB as well as update one.
- **Manual (Fast-F1)**: `pnpm fastf1` from a machine on a residential connection (`VPS_HOST` in `.env`) — asks the box what is missing (`fastf1.sh status`), fetches those sessions locally (`pipeline/scripts/fastf1_fetch.py`, ~45 s each), ships the payload back and loads it (`fastf1.sh import`). This cannot be automated in CI: `livetiming.formula1.com` returns 403 to the VPS *and* to GitHub's runners (measured — see `docs/DEPLOYMENT.md`). The Monday ingest run reports how many races are waiting, since nothing else will remind you.
- `uv run python scripts/should_ingest.py --days 3 [--exit-code]` - Calendar gate; `--exit-code` makes the decision the exit status for shell callers
- `F1DB_VERSION` (env) - f1db release to ingest; `latest` by default, pin a tag for reproducible seeds

### Database
- `pnpm db:backup` / `pnpm db:backup:prod` - Full dump (schema + every table + Alembic stamp + materialized views) of the local dev container, or of production over Tailscale SSH. Use `:prod` for the published seed — Fast-F1 payloads go straight into production, so the server is the only host with the complete dataset
- `pnpm db:seed:fetch` / `pnpm db:seed:publish` - Download the seed dump, or dump production and upload it. **The dump is not tracked by git**: it is an asset on one rolling release tag (`seed`), so the download URL is a constant and a refresh never grows the pack. `db:seed:publish` is `db-backup.sh --remote --publish` and needs `gh` authenticated; it refuses to publish a dump with no lap times
- `pnpm db:restore` - Restore a dump. Detects full vs legacy data-only dumps and orders the migrate/load/refresh steps accordingly; `SKIP_MIGRATE=1 SKIP_VIEWS=1` restores a full dump with nothing but `psql`
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
- Constructor colours come from the backend palette (`src/ingestion/colors.py`)
  and travel on every constructor payload; the frontend only picks a fallback,
  via `teamColorOf()` in `lib/utils.ts`. Never key a colour off a driver ref, and
  never reintroduce a second palette in the frontend — refs are f1db's
  (`red-bull`), not Ergast's (`red_bull`), and a mismatched map fails silently
- The palette has two tiers. `CONSTRUCTOR_COLORS` is a hand-curated livery and
  is the only tier claiming to describe a real car; everything else gets a
  stable shade of its national racing colour from `derive_color()`, keyed off
  `constructors.country_code`, so none of f1db's 187 constructors renders grey.
  Only a constructor f1db gives no country stays uncoloured, and the ingest logs
  it. Derived shades are hashed from the ref, never randomised — a colour that
  moved between ingests would churn the table weekly and change what a reader
  saw last week. Add a curated entry rather than tuning the derivation when a
  specific team looks wrong, and keep `tests/test_constructor_colors.py`'s
  current-grid and champions lists passing: those teams must stay curated
- Anything whose output depends on the viewer's clock, locale or timezone goes
  through `useHydrated()`/`useNow()` in `lib/client-only.ts` (and the
  `LocalDate`/`LocalDateTime`/`LocalTime` components) so the server pass and the
  first client render agree. Never format a date with a hardcoded locale
- Page metadata goes through `buildMetadata()` in `lib/seo.ts` — it fills in the
  canonical URL, Open Graph and Twitter cards from one title/description, and
  the root layout's `%s | F1 Tracker` template appends the suffix, so a page
  title must never carry it itself
- `NEXT_PUBLIC_SITE_URL` is the canonical origin behind every canonical tag,
  Open Graph URL and sitemap entry; nothing else should hardcode the host
- `fetchApi` throws `ApiError` with the upstream status. Detail pages call
  `notFound()` only when `isNotFound(reason)` and rethrow otherwise, so an API
  outage never tells a crawler the resource does not exist
- Icons are generated from `app/icon.svg`; regenerating `favicon.ico`,
  `apple-icon.png` and the `public/icon-*.png` set means re-rendering from it
  rather than editing the binaries
- Client components (`'use client'`) only for interactive pieces (charts, filters, tabs, search)
- Pages are cached, not re-rendered per request. Nothing sets
  `dynamic = 'force-dynamic'`: freshness comes from the fetch-level
  `revalidate`/`tags` in `lib/api.ts`, which Next infers as the route's own
  revalidate, and from the ingest purging the `f1-data` tag. The `[ref]`/`[year]`
  detail routes each export an empty `generateStaticParams()` — without one a
  dynamic segment never enters the full route cache, and with one returning `[]`
  nothing is prerendered at build while the first request for a path still
  caches it. The routes that stay server-rendered are exactly the six reading
  `searchParams`. `/` is the one page with its own `revalidate` (5 minutes),
  because it splits the calendar on the render-time clock rather than on data
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
- **The local dev database moved from PostgreSQL 16 to 17** to match the VPS's shared cluster. A PostgreSQL 16 data directory will not start under 17 (`database files are incompatible with server`), so an existing volume has to go — it holds nothing that is not in the backup:
  ```bash
  docker compose -f docker/docker-compose.yml down -v   # or: docker volume rm f1-tracker_dev_pgdata
  ./scripts/bootstrap.sh                                # recreates and restores
  ```
  The majors have to match in this direction specifically: `pg_dump` output is only guaranteed to load into a server of the same or a later version, and `latest.sql.gz` now comes from production. A 17 dump fails on a 16 server at `SET transaction_timeout`, which does not exist before 17
- **Formula 1 blocks datacentre IPs for Fast-F1 — the VPS's and GitHub's runners alike** (403 from `livetiming.formula1.com`; the control host answers 200, so it is a block, not an outage). Lap times and qualifying sectors therefore cannot be ingested on the server or in CI: they are fetched from a laptop with `pnpm fastf1` (`scripts/fastf1-sync.sh`) and imported as a payload. `scripts/fastf1_fetch.py --probe` re-checks any host in about a second. Fast-F1 does not raise when it is refused — it warns per source and returns an empty session — so three empty sessions in a row abort with the blocked-host message rather than grinding through the calendar at 45 s each.
- The seed dump is a **full** dump and carries the Fast-F1 data (`lap_times`, qualifying sector columns) so a restore never means re-fetching it at ~45 s/session. It only does so when it was taken from production (`pnpm db:seed:publish`) — a local dump carries whatever lap times that database happens to hold, `db-backup.sh` warns when there are none, and `--publish` refuses outright. A seed without them leaves race pages' lap-time, tyre-strategy and position charts empty after a restore
- **The seed dump is no longer committed** — it is an asset on the rolling `seed` release, fetched by `scripts/seed-fetch.sh` (which `bootstrap.sh` calls when `docker/backups/latest.sql.gz` is absent). gzip does not delta-compress, so each committed refresh added its full ~5 MB to the pack forever rather than a diff; sixteen versions had made a ~5 MB artifact into ~49 MB of unshakeable history. Do not re-add it to git — `.gitignore` covers `docker/backups/*`. Publishing replaces the asset in place, so the URL in `lib/db.sh` stays valid
- **Driver headshots and team logos were purged from git history**, not just deleted — `4cb10e1` removed them from the tree for licensing reasons, but every clone still carried them until the history rewrite. Do not reintroduce an image source without the `ATTRIBUTIONS.md` row the Licensing section requires
