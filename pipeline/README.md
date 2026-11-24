# F1 Tracker Pipeline

Python data pipeline and REST API for the F1 Tracker project.

## Overview

This module handles:
1. **Data Ingestion** — Loading f1db (1950-present) and Fast-F1 (session timing, 2018+) into PostgreSQL
2. **REST API** — Serving processed data to the Next.js frontend via FastAPI

## Setup

```bash
# Install dependencies
uv sync

# Start PostgreSQL (from repo root)
docker compose -f docker/docker-compose.yml up -d

# Run migrations
uv run alembic upgrade head

# Seed the database (or restore from backup: ../scripts/db-restore.sh)
uv run python scripts/seed.py

# Start the API server
uv run uvicorn src.api.main:app --reload --port 8000
```

## Project Structure

```
pipeline/
├── src/
│   ├── api/
│   │   ├── main.py            # FastAPI app + CORS + CSP middleware
│   │   ├── routers/           # One module per resource
│   │   ├── constants.py       # Shared magic numbers (page sizes, limits)
│   │   ├── serializers.py     # Reusable driver/constructor dict builders
│   │   └── pagination.py      # Generic paginator helper
│   ├── db/
│   │   ├── models.py          # SQLAlchemy 2 models
│   │   ├── queries.py         # Reusable query helpers
│   │   └── database.py        # Engine, session, Base
│   ├── ingestion/             # f1db + Fast-F1 data pipeline
│   │   ├── fastf1_sessions.py # Fast-F1 → plain dicts (no DB; runs anywhere)
│   │   └── fastf1_payload.py  # NDJSON wire format for off-box fetches
│   └── chat/                  # The Race Engineer (tool loop over the routers)
├── tests/                     # pytest suite
├── scripts/                   # seed.py, fastf1_{status,fetch,import}.py, validate, calendar gate, cache purge
├── alembic/                   # Database migrations
└── pyproject.toml             # Dependencies + ruff/pytest config
```

## Data Sources

- **f1db** ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)): the dataset — seasons,
  races, circuits and layouts, drivers, constructors, results, qualifying, sprint, pit stops and
  official standings, 1950 to present. Ingested from one versioned release download per run
  (`src/ingestion/f1db.py`); pin `F1DB_VERSION` for reproducible seeds.
- **Fast-F1** (MIT): lap-by-lap times, sector times and tyre compound/stint data (2018+) — the only
  source for lap-level detail, which f1db does not carry. Formula 1 refuses datacentre IPs — the
  VPS's and GitHub's runners alike — so production data is fetched from a machine on a residential
  connection and imported as a payload:

  ```bash
  uv run python scripts/fastf1_fetch.py --probe   # may this machine fetch at all?
  cd .. && pnpm fastf1                            # status -> fetch -> import, in one go
  ```

  Against a local database there is no block to work around, so
  `seed.py --laptimes --qualifying-sectors` still does both halves at once. See
  [../docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md).

See [../ATTRIBUTIONS.md](../ATTRIBUTIONS.md).

## API Endpoints

The endpoint list lives in one place, the *Backend Endpoints* section of
[../CLAUDE.md](../CLAUDE.md#backend-endpoints). Full interactive docs at
http://localhost:8000/docs when the server is running.

## Testing

```bash
# Run all tests
uv run pytest -v

# Run a specific test file
uv run pytest tests/test_races.py -v
```

Tests cover the routers, the chat tool loop, the f1db transform helpers and the off-box Fast-F1 path (session parsing, payload round trip, writers, import). They use SQLite in-memory with `StaticPool` and two fixtures:
- `seed_data` — minimal: 1 season, 1 driver, 1 constructor, 1 circuit
- `race_seed_data` — extended: adds race, results, qualifying, standings, pit stop, 2nd driver/constructor

## Linting

```bash
# Check
uv run ruff check .
uv run ruff format --check .

# Auto-fix
uv run ruff check --fix .
uv run ruff format .
```

## Database Migrations

```bash
# Generate a new migration after model changes
uv run alembic revision --autogenerate -m "description"

# Apply migrations
uv run alembic upgrade head

# Downgrade one revision
uv run alembic downgrade -1
```
