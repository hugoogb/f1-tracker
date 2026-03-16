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
- `components/races/` - Race result tables (results with position change indicators, qualifying, sprint, pit stops, lap-times-chart, tyre-strategy-chart, position-chart, pit-stop-analysis, podium-card, fastest-lap-card)
- `components/standings/` - Driver + constructor standings tables
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

### Frontend (from root)
- `pnpm dev` - Start Next.js dev server
- `pnpm build` - Build for production
- `pnpm lint` - Run ESLint

### Backend (from `pipeline/`)
- `uv run uvicorn src.api.main:app --reload` - Start FastAPI dev server
- `uv run alembic upgrade head` - Run database migrations
- `uv run alembic revision --autogenerate -m "description"` - Generate migration
- `uv run python scripts/seed.py` - Run data ingestion
- `uv run pytest -v` - Run backend tests (44 tests)
- `uv run ruff check . && uv run ruff format --check .` - Lint + format check

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
- CI: GitHub Actions — frontend (audit, format, lint, typecheck, build) + backend (ruff, pip-audit, pytest)

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
