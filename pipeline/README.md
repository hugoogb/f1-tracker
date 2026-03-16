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
│   └── ingestion/             # Fast-F1 data pipeline scripts
├── tests/                     # pytest suite (44 tests, 11 files)
├── scripts/                   # seed.py, backup/restore
├── alembic/                   # Database migrations
└── pyproject.toml             # Dependencies + ruff/pytest config
```

## Data Sources

- **Fast-F1**: Primary data source. Covers race results from 1950+, telemetry from 2018+
- **Jolpica-F1**: Ergast API replacement, accessed internally via Fast-F1

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
| `GET /api/seasons/{year}/races/{round}/pitstops` | Pit stop data (2012+) |
| `GET /api/seasons/{year}/races/{round}/pitstops/analysis` | Pit stop analysis (2012+) |
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

44 tests across 11 files covering all routers. Tests use SQLite in-memory with `StaticPool` and two fixtures:
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
