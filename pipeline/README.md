# F1 Tracker Pipeline

Python data pipeline and REST API for the F1 Tracker project.

## Overview

This module handles:
1. **Data Ingestion** — Fetching F1 data from Fast-F1 into PostgreSQL
2. **REST API** — Serving processed data to the Next.js frontend via FastAPI (38 endpoints across 11 routers)

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
│   │   ├── routers/           # 11 route modules
│   │   ├── constants.py       # Shared magic numbers (page sizes, limits)
│   │   ├── serializers.py     # Reusable driver/constructor dict builders
│   │   └── pagination.py      # Generic paginator helper
│   ├── db/
│   │   ├── models.py          # SQLAlchemy 2 models (12 tables)
│   │   ├── queries.py         # Reusable query helpers
│   │   └── database.py        # Engine, session, Base
│   └── ingestion/             # f1db + Fast-F1 data pipeline
│       ├── fastf1_sessions.py # Fast-F1 → plain dicts (no DB; runs anywhere)
│       └── fastf1_payload.py  # NDJSON wire format for off-box fetches
├── tests/                     # pytest suite (120 tests)
├── scripts/                   # seed.py, fastf1_{status,fetch,import}.py, backup/restore
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

### Health & Stats
| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Health check |
| `GET /api/stats` | DB statistics (counts of seasons, drivers, constructors, races, circuits) |

### Seasons & Races
| Endpoint | Description |
|----------|-------------|
| `GET /api/seasons` | List all seasons |
| `GET /api/seasons/{year}` | Season detail with races |
| `GET /api/seasons/{year}/standings/drivers` | Driver standings |
| `GET /api/seasons/{year}/standings/constructors` | Constructor standings |
| `GET /api/seasons/{year}/standings/progression` | Round-by-round championship progression |
| `GET /api/seasons/{year}/standings/constructors/progression` | Constructor championship progression |
| `GET /api/seasons/{year}/heatmap` | Season results heatmap (driver x round grid) |
| `GET /api/seasons/{year}/races/{round}` | Race results with fastest lap |
| `GET /api/seasons/{year}/races/{round}/qualifying` | Qualifying results with sector times |
| `GET /api/seasons/{year}/races/{round}/sprint` | Sprint results (2021+) |
| `GET /api/seasons/{year}/races/{round}/pitstops` | Pit stop data (1994+) |
| `GET /api/seasons/{year}/races/{round}/pitstops/analysis` | Pit stop analysis (1994+) |
| `GET /api/seasons/{year}/races/{round}/positions` | Lap-by-lap positions (2018+) |
| `GET /api/seasons/{year}/races/{round}/laps` | Lap times + tyre strategy (2018+) |

### Drivers
| Endpoint | Description |
|----------|-------------|
| `GET /api/drivers` | List drivers (paginated, nationality filter) |
| `GET /api/drivers/nationalities` | Distinct nationalities |
| `GET /api/drivers/{ref}` | Driver detail with career stats |
| `GET /api/drivers/{ref}/seasons` | Season-by-season history |
| `GET /api/drivers/{ref}/pace` | Qualifying vs race pace per season |

### Constructors
| Endpoint | Description |
|----------|-------------|
| `GET /api/constructors` | List constructors (paginated, nationality filter) |
| `GET /api/constructors/nationalities` | Distinct nationalities |
| `GET /api/constructors/{ref}` | Constructor detail with career stats |
| `GET /api/constructors/{ref}/seasons` | Season-by-season history |
| `GET /api/constructors/{ref}/roster` | Driver roster (optional year param) |

### Circuits
| Endpoint | Description |
|----------|-------------|
| `GET /api/circuits` | List circuits (paginated, country filter) |
| `GET /api/circuits/countries` | Distinct countries |
| `GET /api/circuits/{ref}` | Circuit detail with race history |
| `GET /api/circuits/{ref}/stats` | Circuit performance stats (most wins, poles) |

### Other
| Endpoint | Description |
|----------|-------------|
| `GET /api/champions` | All-time championship winners |
| `GET /api/records` | All-time records (most wins, poles, podiums, etc.) |
| `GET /api/search?q={query}` | Search drivers, constructors, circuits |
| `GET /api/compare/drivers?d1={ref}&d2={ref}` | Driver comparison (H2H, quali H2H, radar, teammate filter) |
| `GET /api/compare/constructors?c1={ref}&c2={ref}` | Constructor comparison with head-to-head |

Full interactive docs at: http://localhost:8000/docs

## Testing

```bash
# Run all tests
uv run pytest -v

# Run a specific test file
uv run pytest tests/test_races.py -v
```

120 tests covering the routers, the f1db transform helpers and the off-box Fast-F1 path (session parsing, payload round trip, writers, import). Tests use SQLite in-memory with `StaticPool` and two fixtures:
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
