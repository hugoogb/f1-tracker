# F1 Tracker

## Project Overview

F1 analytics dashboard covering the complete history of Formula 1 (1950-present) with interactive visualizations and driver comparisons. Full-stack: Next.js frontend + Python FastAPI backend + PostgreSQL.

## Tech Stack

- **Frontend**: Next.js 16 (App Router), TypeScript, Tailwind CSS 4, shadcn/ui, Recharts
- **Backend**: Python 3.12, FastAPI, SQLAlchemy 2, Alembic
- **Database**: PostgreSQL 16 (via Docker Compose)
- **Data Source**: Fast-F1 Python library (historical F1 data)
- **Package Managers**: pnpm (frontend), uv (Python)

## Project Structure

- `apps/web/` - Next.js frontend (15 routes, 36+ components)
- `pipeline/` - Python data pipeline + FastAPI backend (11 routers, 38 endpoints)
- `docker/` - Docker Compose for PostgreSQL

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

### Frontend Components

- `components/ui/` - shadcn/ui base components (badge, button, card, table, tabs, sheet, dialog, dropdown-menu, country-flag, driver-avatar, constructor-logo, empty-state, motion, page-header, position-badge, sonner, stat-card, next-race-countdown)
- `components/layout/` - Header, footer, mobile nav, breadcrumbs, search dialog, theme toggle, nav link
- `components/charts/` - Recharts visualizations (points bar, constructor points, career line, comparison line, championship progression, season heatmap, quali-vs-race, driver radar)
- `components/races/` - Race result tables (results with position change indicators, qualifying, sprint, pit stops, lap-times-chart, tyre-strategy-chart, position-chart, pit-stop-analysis, podium-card, fastest-lap-card, tyre-degradation-chart, gap-chart, stint-pace-table, weather-card, race-control-overlay, weekend-schedule)
- `components/standings/` - Driver + constructor standings tables, title-race-card, teammate-battles
- `components/drivers/` - Driver season history table
- `components/constructors/` - Constructor season history table
- `components/circuits/` - Track layout, world map, world map wrapper
- `components/compare/` - Driver select, constructor select, head-to-head-card, career-stats-table
- `components/providers/` - Theme provider
- Root: pagination, list-filter, error-boundary

### Backend Endpoints

- `GET /api/health` - Health check
- `GET /api/stats` - DB statistics (counts of seasons, drivers, constructors, races, circuits)
- `GET /api/seasons` / `GET /api/seasons/{year}` - Seasons
- `GET /api/seasons/{year}/standings/drivers` / `constructors` - Standings
- `GET /api/seasons/{year}/races/{round}` - Race results
- `GET /api/seasons/{year}/races/{round}/qualifying` - Qualifying
- `GET /api/seasons/{year}/races/{round}/sprint` - Sprint results (2021+)
- `GET /api/seasons/{year}/races/{round}/pitstops` - Pit stops (2012+)
- `GET /api/seasons/{year}/races/{round}/pitstops/analysis` - Pit stop analysis (2012+)
- `GET /api/seasons/{year}/races/{round}/positions` - Lap-by-lap positions (2018+)
- `GET /api/seasons/{year}/races/{round}/laps` - Lap times + tyre strategy (2018+)
- `GET /api/seasons/{year}/races/{round}/tyre-degradation` - Lap time vs tyre age per compound, fuel-corrected (2018+)
- `GET /api/seasons/{year}/races/{round}/stints` - Per-driver stint pace and degradation (2018+)
- `GET /api/seasons/{year}/races/{round}/gaps` - Cumulative gap to leader per lap (2018+)
- `GET /api/seasons/{year}/races/{round}/weather` - Weather samples + summary (2018+)
- `GET /api/seasons/{year}/races/{round}/race-control` - Messages + derived safety car periods (2018+)
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
- `GET /api/search?q={query}` - Search drivers, constructors, circuits, races, seasons
- `GET /api/compare/drivers?d1={ref}&d2={ref}&teammate=bool` - Driver comparison with H2H, quali H2H, radar stats
- `GET /api/compare/constructors?c1={ref}&c2={ref}` - Constructor comparison with head-to-head
- `GET /api/records` - All-time records (most wins, poles, podiums, championships, etc.)
- `GET /api/seasons/{year}/standings/progression` - Round-by-round championship progression
- `GET /api/seasons/{year}/heatmap` - Season results heatmap (driver × round grid)
- `GET /api/seasons/{year}/title-race` - Who can still mathematically win the title
- `GET /api/seasons/{year}/teammates` - Per-constructor intra-team head-to-head

## Commands

### Local setup (from root)
- `./scripts/bootstrap.sh` - One-command setup: `.env` + DB + migrations + restore backup + frontend deps

### Frontend (from root)
- `pnpm dev` - Start Next.js dev server
- `pnpm build` - Build for production
- `pnpm lint` - Run ESLint
- `pnpm test` - Run frontend unit tests (vitest)

### Backend (from `pipeline/`)
- `uv run uvicorn src.api.main:app --reload` - Start FastAPI dev server
- `uv run alembic upgrade head` - Run database migrations
- `uv run alembic revision --autogenerate -m "description"` - Generate migration
- `uv run python scripts/seed.py` - Run data ingestion
- `uv run python scripts/seed.py --base --refresh-schedule --year-range 2005-2026` - Backfill schedule fields (race start times, weekend sessions) on closed seasons, which are otherwise skipped
- `uv run python scripts/seed.py --base --refresh-drivers` - Backfill driver reference fields such as three-letter codes
- `uv run python scripts/seed.py --weather` - Ingest weather + race control (2018+)
- `uv run pytest -v` - Run backend tests
- `uv run ruff check . && uv run ruff format --check .` - Lint + format check

### Data Updates
- `./scripts/update-neon.sh` - Ingest new race data locally + push to Neon (one command, dump/restore)
- `./scripts/update-neon.sh --results --standings` - Custom seed flags
- Requires `NEON_DATABASE_URL` in `.env`
- **Automated**: `.github/workflows/ingest.yml` runs Mondays, calendar-gated, ingests current-year data directly into Neon. Requires `NEON_DATABASE_URL` GitHub secret + Neon pre-seeded (the skip-if-exists ingestors can't bootstrap an empty DB).
- `uv run python scripts/should_ingest.py --days 3` - Calendar gate (used by the workflow): exits with `should_ingest=true/false`

### Database
- `docker compose -f docker/docker-compose.yml up -d` - Start PostgreSQL
- `docker compose -f docker/docker-compose.yml down` - Stop PostgreSQL

## Conventions

- Use conventional commits (feat:, fix:, docs:, refactor:, test:, chore:)
- Frontend: shadcn/ui components in `components/ui/`, feature components in `components/<feature>/`
- Backend: FastAPI routers in `src/api/routers/`, SQLAlchemy models in `src/db/models.py`
- Backend shared helpers: `src/api/constants.py` (magic numbers), `src/api/serializers.py` (driver/constructor dict builders), `src/api/pagination.py` (generic paginator)
- All API endpoints prefixed with `/api/`
- Next.js frontend calls FastAPI at `NEXT_PUBLIC_API_URL` (default: http://localhost:8000/api)
- Dark-mode-first UI with F1 team colors
- Use `Promise.allSettled` for optional data fetching (graceful degradation)
- Client components (`'use client'`) only for interactive pieces (charts, filters, tabs, search)
- Pre-commit: Husky runs lint-staged (prettier) + ruff check/format on staged `.py` files
- CI: GitHub Actions — frontend (audit, format, lint, typecheck, test, build) + backend (ruff, pip-audit, pytest)
- Analysis logic lives in pure modules (`src/api/lap_analysis.py`, `championship.py`, `race_control.py`, `teammates.py`) taking plain dataclasses, so it is testable without a database
- Frontend tests: vitest + testing-library, colocated as `*.test.ts(x)`

## Next Phases

### Phase 3 — Advanced Features
- [x] **Weather data** (2018+): Air/track temp, humidity, wind, rainfall — `RaceWeather` model
- [x] **Race control events** (2018+): Safety cars, flags — shaded periods on the lap-axis charts
- [x] **Tyre degradation analysis**: Lap time vs tyre age per compound, fuel-corrected
- [x] **Gap analysis chart**: Cumulative gap to leader through a race
- [x] **Race weekend schedule**: Practice/qualifying/sprint session times, `RaceSession` model
- [x] **Championship permutations**: Who can still mathematically win the title
- [x] **Teammate head-to-head**: Per-season intra-team race and qualifying battles
- [x] **Dynamic OpenGraph cards**: Generated share images for driver, constructor and race pages
- **Telemetry visualization** (2018+): Speed/throttle/brake traces — on-demand from Fast-F1 cache (not stored in DB)
- **OpenF1 live data** (2023+): Real-time positions, intervals, team radio — WebSocket/SSE architecture

### Phase 4 — Content management (admin panel)
Driver headshots, constructor logos and team colours are sparsely populated
(roughly 11%, 25% and 36% of rows respectively) and cannot be improved by more
scraping — the upstream sources have been exhausted. Filling them needs a human
in the loop, which means an admin panel. Note the blocker: images currently live
as files under `apps/web/public/`, written by the ingestor and committed to the
repo. Both Vercel and Render have read-only runtime filesystems, so an admin
panel that writes there works locally and silently does nothing in production.
The asset store has to move into the database or object storage first.

## Known Issues

- Next.js 16 build requires `NODE_ENV=production` to avoid `_global-error` prerender bug
- `race_results.status_id` is NULL for recent seasons, so finishing statuses are unavailable there. `position_text` still distinguishes a finish (a number) from a retirement ("R"), a withdrawal ("W") or a disqualification ("D") — use it, not `position`, to tell them apart, since retirements still carry a numeric position
- Ingestors skip work that already exists, so a newly added field stays NULL on rows loaded before it. `--refresh-schedule` and `--refresh-drivers` exist to backfill; new fields generally need a comparable escape hatch
- `docker/backups/latest.sql.gz` carries a `\restrict` header from pg_dump 16.14. Restoring with an older psql fails on the COPY terminators; strip those lines or use a matching client
