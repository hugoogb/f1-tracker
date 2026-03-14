# F1 Tracker

A web-based Formula 1 analytics dashboard that covers the entire history of F1 (1950-present) with rich, interactive visualizations.

## Features

- **Season Overview**: World Champions (driver + constructor) for every season since 1950
- **Driver Profiles**: Career stats including wins, podiums, poles, championships, points progression
- **Constructor Profiles**: Team history, championship wins, driver roster by year
- **Race Results**: Browse any race result from any season with detailed breakdowns
- **Standings**: Driver and constructor standings for any selected season
- **Charts**: Points progression, wins analysis, and more interactive visualizations
- **Search**: Find any driver, team, or season instantly

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, TypeScript, Tailwind CSS 4, shadcn/ui, Recharts |
| Backend | Python 3.12, FastAPI, SQLAlchemy 2, Alembic |
| Database | PostgreSQL 16 |
| Data Source | Fast-F1 (historical F1 data from 1950+, telemetry from 2018+) |

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 10+
- Python 3.12+
- uv (Python package manager)
- Docker & Docker Compose

### Setup

1. Clone the repository:
```bash
git clone <repo-url>
cd f1-tracker
```

2. Copy environment variables:
```bash
cp .env.example .env
```

3. Start PostgreSQL:
```bash
docker compose -f docker/docker-compose.yml up -d
```

4. Install frontend dependencies:
```bash
pnpm install
```

5. Install Python dependencies:
```bash
cd pipeline && uv sync
```

6. Run database migrations:
```bash
cd pipeline && uv run alembic upgrade head
```

7. Seed the database with F1 data:
```bash
cd pipeline && uv run python scripts/seed.py
```

8. Start the backend API:
```bash
cd pipeline && uv run uvicorn src.api.main:app --reload
```

9. Start the frontend (in another terminal):
```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Project Structure

```
f1-tracker/
├── apps/web/          # Next.js frontend
├── pipeline/          # Python data pipeline + FastAPI
│   ├── src/api/       # REST API
│   ├── src/db/        # Database models and queries
│   ├── src/ingestion/ # Data pipeline (Fast-F1 → PostgreSQL)
│   └── alembic/       # Database migrations
├── docker/            # Docker Compose (PostgreSQL)
└── tasks/             # Project tracking
```

## API Documentation

When the backend is running, visit [http://localhost:8000/docs](http://localhost:8000/docs) for interactive API documentation (Swagger UI).
