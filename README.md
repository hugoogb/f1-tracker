# F1 Tracker

A full-stack Formula 1 analytics dashboard covering the complete history of F1 (1950-present) with interactive visualizations, driver/constructor comparisons, and detailed race analysis.

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
| Data Source | Fast-F1 (historical F1 data from 1950+, telemetry from 2018+) |

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

# 2. Start PostgreSQL
docker compose -f docker/docker-compose.yml up -d

# 3. Install dependencies
pnpm install
cd pipeline && uv sync && cd ..

# 4. Set up database
cd pipeline && uv run alembic upgrade head && cd ..

# 5. Seed data (or restore from backup: ./scripts/db-restore.sh)
cd pipeline && uv run python scripts/seed.py && cd ..

# 6. Start backend + frontend (in separate terminals)
cd pipeline && uv run uvicorn src.api.main:app --reload
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

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
| `cd pipeline && uv run pytest -v` | Run backend tests (44 tests) |
| `cd pipeline && uv run ruff check . && uv run ruff format --check .` | Lint + format check |
| `docker compose -f docker/docker-compose.yml up -d` | Start PostgreSQL |

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
│   ├── src/api/           # REST API (routers, constants, serializers, pagination)
│   ├── src/db/            # SQLAlchemy models, queries, migrations
│   ├── src/ingestion/     # Data pipeline (Fast-F1 → PostgreSQL)
│   ├── tests/             # pytest test suite (44 tests)
│   └── scripts/           # Seed, backup, restore scripts
├── docker/                # Docker Compose (PostgreSQL) + backups
├── docs/                  # Deployment guide
└── tasks/                 # Project tracking + lessons learned
```

## Testing & CI

- **Backend**: 44 pytest tests across 11 test files (SQLite in-memory with StaticPool)
- **Frontend**: TypeScript type checking (`tsc --noEmit`) + ESLint + production build verification
- **CI**: GitHub Actions runs on push/PR to master — prettier, eslint, typecheck, build, ruff, pytest, security audits (`pnpm audit`, `pip-audit`)

## Documentation

- **API Docs**: Interactive Swagger UI at [http://localhost:8000/docs](http://localhost:8000/docs) when the backend is running
- **Deployment**: See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for local dev, free tier (Vercel + Render + Neon), and production deployment guides
- **Backend**: See [pipeline/README.md](pipeline/README.md) for API endpoints, testing, and project structure
