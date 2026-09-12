# F1 Tracker

[![CI](https://github.com/hugoogb/f1-tracker/actions/workflows/ci.yml/badge.svg)](https://github.com/hugoogb/f1-tracker/actions/workflows/ci.yml)

A full-stack Formula 1 analytics dashboard covering the complete history of F1 (1950-present) with interactive visualizations, driver/constructor comparisons, and detailed race analysis.

> **Unofficial fan project.** F1 Tracker is not associated in any way with the
> Formula 1 companies. F1, FORMULA ONE, FORMULA 1, FIA FORMULA ONE WORLD CHAMPIONSHIP, GRAND PRIX
> and related marks are trade marks of Formula One Licensing B.V. See
> [ATTRIBUTIONS.md](ATTRIBUTIONS.md).

## Features

- **Season Overview**: World Champions (driver + constructor) for every season since 1950, championship progression charts
- **Driver Profiles**: Career stats (wins, podiums, poles, fastest laps, championships), points progression, qualifying vs race pace analysis
- **Constructor Profiles**: Team history, career stats, driver roster by year, team colors and logos
- **Race Detail**: Full results, qualifying (with sector times), sprint, pit stops with analysis, lap-by-lap positions, tyre strategy charts
- **Circuit Pages**: Circuit details with track layouts, race history, performance stats, interactive world map
- **All-Time Records**: Most wins, poles, podiums, championships, fastest laps, starts — for drivers and constructors
- **Comparison**: Side-by-side driver comparison (head-to-head, qualifying H2H, radar charts, teammate filter) and constructor comparison
- **Search**: Find any driver, team, or circuit instantly
- **Dark Mode**: F1-themed dark-first UI with team colors and smooth animations

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, TypeScript, Tailwind CSS 4, shadcn/ui, Recharts |
| Backend | Python 3.12, FastAPI, SQLAlchemy 2, Alembic |
| Database | PostgreSQL 16 |
| Data Source | [f1db](https://github.com/f1db/f1db) (1950-present, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)) + Fast-F1 (session timing 2018+) |
| Map | Natural Earth geometry (public domain), rendered with Leaflet |
| Deployment | Frontend on Vercel; API + PostgreSQL in Docker on a self-hosted VPS |

## Getting Started

### Prerequisites

- Node.js 20+, pnpm 10+
- Python 3.12+, [uv](https://docs.astral.sh/uv/)
- Docker & Docker Compose

### Quick Start

```bash
# 1. Clone and configure
git clone <repo-url> && cd f1-tracker
cp .env.example .env

# 2. Start PostgreSQL (container: f1-tracker-db)
docker compose -f docker/docker-compose.yml up -d

# 3. Install dependencies
pnpm install
cd pipeline && uv sync && cd ..

# 4. Restore the bundled backup — schema, data and all (seconds)
./scripts/db-restore.sh

#    ...or build the database from scratch instead (slow)
# cd pipeline && uv run alembic upgrade head && uv run python scripts/seed.py && cd ..

# 5. Start backend + frontend (in separate terminals)
cd pipeline && uv run uvicorn src.api.main:app --reload
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Keeping production data fresh

Two jobs, and only one of them is yours.

**Automatic.** `.github/workflows/ingest.yml` runs every Monday at 06:00 UTC and
loads the f1db dataset — results, qualifying, standings, pit stops, the calendar
— straight into the production database, then purges the Vercel cache. Nothing
to do.

**Manual, after a race weekend.** Lap times and qualifying sector times come
from Fast-F1, and Formula 1 answers `livetiming.formula1.com` with a 403 for
datacentre IPs — the VPS's *and* GitHub's runners. They have to be fetched from
a machine on a residential connection, which means yours:

```bash
pnpm fastf1
```

That asks the server what is missing, fetches those sessions here, and loads
them there. Set `VPS_HOST` in `.env` once and it needs no arguments.

| | |
|---|---|
| `pnpm fastf1` | The 8 most recent sessions missing data (a race weekend is 2) |
| `pnpm fastf1 --all` | Everything still missing — hours, and safe to interrupt |
| `pnpm fastf1 --dry-run` | Fetch, but write nothing to the database |
| `pnpm fastf1 --probe` | Check whether this machine can reach Fast-F1 at all |

Each session is throttled to ~45 s to stay inside Fast-F1's rate limit, so this
takes a couple of minutes per race weekend. Ctrl-C is safe: everything fetched
so far is kept, and the next run picks up what is still missing. The Monday
ingest reports the outstanding count in its job summary, so a missed week is
visible.

**Worth doing after a backfill.** `pnpm db:backup:prod` pulls a full dump of the
production database into `docker/backups/latest.sql.gz` — schema, data, Alembic
stamp and materialized views, Fast-F1 lap times included. Committing it is what
makes those hours of fetching survivable: restoring takes seconds and re-fetching
does not.

Full detail, including what to do if your own connection gets blocked, is in
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#fast-f1-data-lap-times-qualifying-sectors).

## Development

### Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start Next.js dev server |
| `pnpm build` | Build frontend for production |
| `pnpm lint` | Run ESLint |
| `pnpm typecheck` | Run TypeScript type checking |
| `pnpm format` | Format all files with Prettier |
| `cd pipeline && uv run uvicorn src.api.main:app --reload` | Start FastAPI dev server |
| `cd pipeline && uv run pytest -v` | Run backend tests |
| `cd pipeline && uv run ruff check . && uv run ruff format --check .` | Lint + format check |
| `docker compose -f docker/docker-compose.yml up -d` | Start PostgreSQL |
| `/srv/apps/f1_api/ingest.sh` | Run a data ingest on the VPS (calendar-gated); scheduled weekly by `.github/workflows/ingest.yml` |
| `pnpm fastf1` | Fetch lap times + qualifying sectors here and load them on the VPS — see [Keeping production data fresh](#keeping-production-data-fresh) |

### Pre-commit Hooks

Husky runs automatically on `git commit`:
- **Prettier** on staged TS/TSX, JSON, CSS, MD, YAML files
- **Ruff** check + format on staged Python files

## Project Structure

```
f1-tracker/
├── apps/web/              # Next.js frontend (15 routes, 36+ components)
│   ├── app/               # App Router pages
│   ├── components/        # UI, charts, races, standings, compare, layout
│   └── lib/               # API client, types, utils, constants
├── pipeline/              # Python data pipeline + FastAPI (38 endpoints)
│   ├── Dockerfile         # API image (also runs migrations + ingest)
│   ├── src/api/           # REST API (routers, constants, serializers, pagination)
│   ├── src/db/            # SQLAlchemy models, queries, migrations
│   ├── src/ingestion/     # Data pipeline (f1db + Fast-F1 → PostgreSQL)
│   ├── tests/             # pytest test suite
│   └── scripts/           # Seed, validate, calendar-gate scripts
├── docker/                # Compose files (local dev + VPS production) + backups
├── scripts/               # bootstrap, backup/restore, VPS deploy + ingest
└── docs/                  # Deployment guide + VPS migration runbook
```

## Testing & CI

- **Backend**: pytest suite across 14 test files (SQLite in-memory with StaticPool)
- **Frontend**: TypeScript type checking (`tsc --noEmit`) + ESLint + production build verification
- **CI**: GitHub Actions runs on push/PR to master — prettier, eslint, typecheck, build, ruff, pytest, security audits (`pnpm audit`, `pip-audit`), and a backend Docker image build + smoke test

## Documentation

- **API Docs**: Interactive Swagger UI at [http://localhost:8000/docs](http://localhost:8000/docs) when the backend is running
- **Deployment**: See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for local dev and the Vercel + VPS production setup
- **Backend**: See [pipeline/README.md](pipeline/README.md) for API endpoints, testing, and project structure

## Licence & Attribution

| What | Licence |
|------|---------|
| Source code | [MIT](LICENSE) |
| F1 dataset (incl. `docker/backups/latest.sql.gz`) | [CC BY 4.0](LICENSE-DATA.md) — from f1db; session timing from Fast-F1 |
| Circuit layout SVGs | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) — ship with f1db |
| World map geometry | Public domain — Natural Earth |

**Every obligation is attribution.** No source restricts commercial use or imposes share-alike:
f1db is CC BY 4.0, Fast-F1 is MIT, Natural Earth is public domain. Keeping the credits intact is
the whole requirement.

Driver photographs and team badges are deliberately **not** used. Every available source (OpenF1,
TheSportsDB, Wikimedia Commons) carried its own licence, trademark or per-image attribution
obligation, so drivers and teams are rendered as initials on the team colour instead.

Users see the trademark notice and data credits in the site footer, with the complete breakdown at
`/attributions`.

Rights holders: open an issue and anything used improperly will be removed promptly.
