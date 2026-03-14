# F1 Tracker Pipeline

Python data pipeline and REST API for the F1 Tracker project.

## Overview

This module handles:
1. **Data Ingestion** - Fetching F1 data from Fast-F1 into PostgreSQL
2. **REST API** - Serving processed data to the Next.js frontend via FastAPI

## Setup

```bash
# Install dependencies
uv sync

# Start PostgreSQL (from repo root)
docker compose -f docker/docker-compose.yml up -d

# Run migrations
uv run alembic upgrade head

# Seed the database
uv run python scripts/seed.py

# Start the API server
uv run uvicorn src.api.main:app --reload --port 8000
```

## Data Sources

- **Fast-F1**: Primary data source. Covers race results from 1950+, telemetry from 2018+
- **Jolpica-F1**: Ergast API replacement, accessed internally via Fast-F1

## Database Migrations

```bash
# Generate a new migration after model changes
uv run alembic revision --autogenerate -m "description"

# Apply migrations
uv run alembic upgrade head

# Downgrade one revision
uv run alembic downgrade -1
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Health check |
| `GET /api/seasons` | List all seasons |
| `GET /api/seasons/{year}` | Season detail with races |
| `GET /api/seasons/{year}/standings/drivers` | Driver standings |
| `GET /api/seasons/{year}/standings/constructors` | Constructor standings |
| `GET /api/seasons/{year}/races/{round}` | Race results |
| `GET /api/seasons/{year}/races/{round}/qualifying` | Qualifying results |
| `GET /api/drivers` | List all drivers (paginated) |
| `GET /api/drivers/{ref}` | Driver profile with career stats |
| `GET /api/constructors` | List all constructors (paginated) |
| `GET /api/constructors/{ref}` | Constructor profile |

Full interactive docs at: http://localhost:8000/docs
