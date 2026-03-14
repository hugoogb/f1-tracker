# F1 Tracker

## Project Overview

F1 analytics dashboard covering the complete history of Formula 1 (1950-present) with interactive visualizations and driver comparisons. Full-stack: Next.js frontend + Python FastAPI backend + PostgreSQL.

## Tech Stack

- **Frontend**: Next.js 15 (App Router), TypeScript, Tailwind CSS 4, shadcn/ui, Recharts
- **Backend**: Python 3.12, FastAPI, SQLAlchemy 2, Alembic
- **Database**: PostgreSQL 16 (via Docker Compose)
- **Data Source**: Fast-F1 Python library (historical F1 data)
- **Package Managers**: pnpm (frontend), uv (Python)

## Project Structure

- `apps/web/` - Next.js frontend (13 routes, 35 components)
- `pipeline/` - Python data pipeline + FastAPI backend (10 routers, 28 endpoints)
- `docker/` - Docker Compose for PostgreSQL

### Frontend Routes

| Route | Description |
|-------|-------------|
| `/` | Home dashboard (stats, standings, race calendar) |
| `/seasons` | Season list |
| `/seasons/[year]` | Season detail (standings + charts) |
| `/seasons/[year]/races/[round]` | Race detail (results, qualifying, sprint, pit stops) |
| `/drivers` | Driver list (filterable by nationality) |
| `/drivers/[ref]` | Driver profile (stats, career chart, season history) |
| `/constructors` | Constructor list (filterable by nationality) |
| `/constructors/[ref]` | Constructor profile (stats, career chart, season history, roster) |
| `/circuits` | Circuit list (filterable by country) |
| `/circuits/[ref]` | Circuit detail (location, race history) |
| `/champions` | All-time champions |
| `/compare` | Driver comparison selector |
| `/compare/drivers` | Side-by-side driver comparison |

### Frontend Components

- `components/ui/` - shadcn/ui base components (badge, button, card, table, tabs, sheet, etc.)
- `components/layout/` - Header, footer, mobile nav, breadcrumbs, search dialog, theme toggle, nav link
- `components/charts/` - Recharts visualizations (points bar, constructor points, career line, comparison line)
- `components/races/` - Race result tables (results, qualifying, sprint, pit stops)
- `components/standings/` - Driver + constructor standings tables
- `components/drivers/` - Driver season history table
- `components/constructors/` - Constructor season history table
- `components/compare/` - Driver select component
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
- `GET /api/drivers` - Drivers (pagination + nationality filter)
- `GET /api/drivers/nationalities` - Distinct nationalities
- `GET /api/drivers/{ref}` - Driver detail with career stats
- `GET /api/drivers/{ref}/seasons` - Driver season-by-season history
- `GET /api/constructors` - Constructors (pagination + nationality filter)
- `GET /api/constructors/nationalities` - Distinct nationalities
- `GET /api/constructors/{ref}` - Constructor detail with career stats
- `GET /api/constructors/{ref}/seasons` - Constructor season-by-season history
- `GET /api/constructors/{ref}/roster` - Driver roster (optional year param)
- `GET /api/circuits` - Circuits (pagination + country filter)
- `GET /api/circuits/countries` - Distinct countries
- `GET /api/circuits/{ref}` - Circuit detail with race history
- `GET /api/champions` - All championship winners
- `GET /api/search?q={query}` - Search drivers, constructors, circuits
- `GET /api/compare/drivers?d1={ref}&d2={ref}` - Driver comparison with head-to-head

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

### Database
- `docker compose -f docker/docker-compose.yml up -d` - Start PostgreSQL
- `docker compose -f docker/docker-compose.yml down` - Stop PostgreSQL

## Conventions

- Use conventional commits (feat:, fix:, docs:, refactor:, test:, chore:)
- Frontend: shadcn/ui components in `components/ui/`, feature components in `components/<feature>/`
- Backend: FastAPI routers in `src/api/routers/`, SQLAlchemy models in `src/db/models.py`
- All API endpoints prefixed with `/api/`
- Next.js frontend calls FastAPI at `NEXT_PUBLIC_API_URL` (default: http://localhost:8000/api)
- Dark-mode-first UI with F1 team colors
- Use `Promise.allSettled` for optional data fetching (graceful degradation)
- Client components (`'use client'`) only for interactive pieces (charts, filters, tabs, search)

## Known Issues

- Next.js 16 build requires `NODE_ENV=production` to avoid `_global-error` prerender bug
