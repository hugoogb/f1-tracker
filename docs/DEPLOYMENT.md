# Deployment Guide

How to deploy the F1 Tracker application (Next.js frontend + FastAPI backend + PostgreSQL).

## Architecture

```
                    ┌─────────────────┐
                    │  Reverse Proxy  │
                    │ (nginx / Caddy) │
                    └───────┬─────────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
     ┌────────▼────────┐        ┌─────────▼────────┐
     │    Frontend      │        │     Backend       │
     │  Next.js :3000   │───────▶│  FastAPI :8000    │
     └─────────────────┘        └────────┬──────────┘
                                         │
                                ┌────────▼──────────┐
                                │   PostgreSQL       │
                                │     :5432          │
                                └───────────────────┘
```

## Prerequisites

| Tool       | Version | Purpose            |
| ---------- | ------- | ------------------ |
| Docker     | 20+     | PostgreSQL         |
| Node.js    | 20+     | Next.js frontend   |
| pnpm       | 9+      | Frontend packages  |
| Python     | 3.12+   | FastAPI backend    |
| uv         | latest  | Python packages    |
| PostgreSQL | 16      | Database (or Docker) |

## Environment Variables

Create a `.env` file at the project root. All variables have development defaults, but **must** be overridden for production.

| Variable             | Default                                                          | Description                              |
| -------------------- | ---------------------------------------------------------------- | ---------------------------------------- |
| `DATABASE_URL`       | `postgresql://f1tracker:f1tracker_dev@localhost:5432/f1tracker`   | PostgreSQL connection string             |
| `FASTAPI_HOST`       | `0.0.0.0`                                                       | Backend listen address                   |
| `FASTAPI_PORT`       | `8000`                                                           | Backend listen port                      |
| `FASTAPI_DEBUG`      | `True`                                                           | Set to `False` in production             |
| `FASTF1_CACHE_DIR`   | `.fastf1_cache`                                                  | Fast-F1 data cache directory             |
| `CORS_ORIGINS`        | `http://localhost:3000`                                          | Comma-separated list of allowed CORS origins         |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000/api`                                     | Backend API URL (used by the frontend at build time) |

> **Note**: `NEXT_PUBLIC_API_URL` is baked into the Next.js bundle at build time. You must set it **before** running `pnpm build`.

## Local Development Setup

### 1. Start the database

```bash
docker compose -f docker/docker-compose.yml up -d
```

### 2. Run database migrations

```bash
cd pipeline
uv run alembic upgrade head
```

### 3. Seed data (or restore from backup)

Restore from the included backup (fastest):

```bash
./scripts/db-restore.sh
```

Or run the full ingestion pipeline:

```bash
cd pipeline
uv run python scripts/seed.py --base --results --qualifying --standings --pitstops --sprints
```

### 4. Start the backend

```bash
cd pipeline
uv run uvicorn src.api.main:app --reload
```

The API will be available at `http://localhost:8000/api`.

### 5. Start the frontend

```bash
pnpm install
pnpm dev
```

The app will be available at `http://localhost:3000`.

---

## Free Deployment (Vercel + Render + Neon)

Deploy the full app for **$0/month** using free tiers from three platforms:

| Component  | Platform | Free Tier Limits                                      |
| ---------- | -------- | ----------------------------------------------------- |
| Frontend   | Vercel   | 100 GB bandwidth, 1M function invocations/month       |
| Backend    | Render   | 750 instance hours/month, 100 GB bandwidth            |
| Database   | Neon     | 0.5 GB storage, 100 compute-hours/month, no expiry    |

> **Limitations**: Render free services spin down after 15 min of inactivity (30-60s cold start on next request). Vercel Hobby plan is for non-commercial use only.

### 1. Set up the database (Neon)

1. Create a free account at [neon.tech](https://neon.tech)
2. Create a new project and copy the connection string (looks like `postgresql://user:pass@ep-xyz.region.aws.neon.tech/neondb?sslmode=require`)
3. Run migrations from your local machine to create the schema:

```bash
cd pipeline
DATABASE_URL="<your-neon-connection-string>" uv run alembic upgrade head
```

4. Restore data from backup:

```bash
gunzip -c docker/backups/latest.sql.gz | psql "<your-neon-connection-string>" --single-transaction
```

> **Tip**: The F1 dataset is ~300 MB and fits within Neon's 0.5 GB free tier. Requires `psql` client installed locally (`sudo apt install postgresql-client`).

### 2. Deploy the backend (Render)

1. Push your repo to GitHub
2. Go to [render.com](https://render.com), create a new **Web Service**, and connect your GitHub repo
3. Configure the service:

| Setting           | Value                                                          |
| ----------------- | -------------------------------------------------------------- |
| **Root Directory** | `pipeline`                                                    |
| **Runtime**        | `Python`                                                      |
| **Build Command**  | `pip install uv && uv sync`                                  |
| **Start Command**  | `uv run uvicorn src.api.main:app --host 0.0.0.0 --port $PORT` |
| **Instance Type**  | `Free`                                                        |

4. Add environment variables in the Render dashboard:

| Variable         | Value                                    |
| ---------------- | ---------------------------------------- |
| `DATABASE_URL`   | Your Neon connection string              |
| `FASTAPI_DEBUG`  | `False`                                  |
| `CORS_ORIGINS`   | `https://<your-app>.vercel.app`          |

5. Deploy. Note the service URL (e.g., `https://f1-tracker-api.onrender.com`)

### 3. Deploy the frontend (Vercel)

1. Go to [vercel.com](https://vercel.com) and import your GitHub repo
2. Configure the project:

| Setting              | Value                                              |
| -------------------- | -------------------------------------------------- |
| **Root Directory**    | `apps/web`                                        |
| **Framework Preset**  | `Next.js` (auto-detected)                         |
| **Build Command**     | `pnpm build` (default)                            |
| **Install Command**   | `pnpm install` (default)                          |

3. Add the environment variable:

| Variable              | Value                                               |
| --------------------- | --------------------------------------------------- |
| `NEXT_PUBLIC_API_URL` | `https://<your-render-service>.onrender.com/api`    |

4. Deploy. Vercel auto-assigns a `.vercel.app` domain

### 4. Update CORS

After Vercel assigns your domain, go back to Render and update the `CORS_ORIGINS` env var to match:

```
CORS_ORIGINS=https://your-app.vercel.app
```

For multiple origins (e.g., custom domain + Vercel preview):

```
CORS_ORIGINS=https://your-app.vercel.app,https://your-custom-domain.com
```

### 5. Verify

```bash
# Health check
curl https://<your-render-service>.onrender.com/api/health

# Open the frontend
open https://<your-app>.vercel.app
```

> **Note**: The first request after inactivity will be slow (~30-60s) while Render spins up the backend. Subsequent requests are fast.

---

## Production Deployment

### 1. Database

**Option A: Docker** (simple, single-server deployments)

Use the provided Docker Compose file with production credentials:

```bash
POSTGRES_PASSWORD=<strong-password> docker compose -f docker/docker-compose.yml up -d
```

**Option B: Managed service** (recommended for production)

Use a managed PostgreSQL service (AWS RDS, Supabase, Neon, etc.) and set `DATABASE_URL` accordingly.

### 2. Run migrations

```bash
cd pipeline
DATABASE_URL="postgresql://user:pass@host:5432/f1tracker" uv run alembic upgrade head
```

### 3. Seed data

Restore from the latest backup:

```bash
# If using Docker:
gunzip -c docker/backups/latest.sql.gz | docker exec -i <container> psql -U f1tracker -d f1tracker --single-transaction

# If using a remote DB:
gunzip -c docker/backups/latest.sql.gz | psql "$DATABASE_URL" --single-transaction
```

### 4. Backend

Run uvicorn with production settings:

```bash
cd pipeline
DATABASE_URL="postgresql://user:pass@host:5432/f1tracker" \
FASTAPI_DEBUG=False \
uv run uvicorn src.api.main:app \
  --host 0.0.0.0 \
  --port 8000 \
  --workers 4
```

For process management, use a supervisor like **systemd** or **supervisord**:

```ini
# /etc/systemd/system/f1-api.service
[Unit]
Description=F1 Tracker API
After=network.target postgresql.service

[Service]
Type=simple
User=f1tracker
WorkingDirectory=/opt/f1-tracker/pipeline
Environment=DATABASE_URL=postgresql://user:pass@localhost:5432/f1tracker
Environment=FASTAPI_DEBUG=False
ExecStart=/usr/bin/env uv run uvicorn src.api.main:app --host 0.0.0.0 --port 8000 --workers 4
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### 5. Frontend

Build and start the Next.js production server:

```bash
NEXT_PUBLIC_API_URL="https://your-domain.com/api" pnpm build
pnpm start
```

> **Important**: The build requires `NODE_ENV=production` (already set in the build script).

For process management:

```ini
# /etc/systemd/system/f1-web.service
[Unit]
Description=F1 Tracker Frontend
After=network.target

[Service]
Type=simple
User=f1tracker
WorkingDirectory=/opt/f1-tracker
ExecStart=/usr/bin/env pnpm start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### 6. Reverse Proxy

A reverse proxy serves both frontend and backend under one domain and handles HTTPS.

**Caddy** (automatic HTTPS):

```
your-domain.com {
    handle /api/* {
        reverse_proxy localhost:8000
    }
    handle {
        reverse_proxy localhost:3000
    }
}
```

**nginx**:

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location /api/ {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

When using a reverse proxy, set `NEXT_PUBLIC_API_URL` to the proxy URL (e.g., `https://your-domain.com/api`) so the frontend calls the API through the same domain.

---

## CORS Configuration

CORS origins are configurable via the `CORS_ORIGINS` environment variable (comma-separated):

```bash
# Single origin (default)
CORS_ORIGINS=http://localhost:3000

# Multiple origins
CORS_ORIGINS=https://your-app.vercel.app,https://your-custom-domain.com
```

If using a reverse proxy where both frontend and API share the same domain, CORS may not be needed at all (same-origin requests).

---

## Database Backup & Restore

### Create a backup

```bash
./scripts/db-backup.sh
```

Saves a gzipped data-only dump to `docker/backups/` with automatic rotation (keeps last 5).

### Restore from backup

```bash
./scripts/db-restore.sh                          # uses latest backup
./scripts/db-restore.sh docker/backups/file.sql.gz  # specific backup
```

The restore script runs Alembic migrations first to ensure the schema is up to date.

---

## CI/CD

The project includes a GitHub Actions workflow at `.github/workflows/ci.yml` that runs on pushes and PRs to `main`:

**Frontend checks**: Prettier, ESLint, TypeScript type check, production build.

**Backend checks**: Ruff (lint + format), pytest (with PostgreSQL service container).

---

## Production Checklist

- [ ] Set strong PostgreSQL credentials (not the dev defaults)
- [ ] Set `FASTAPI_DEBUG=False`
- [ ] Set `CORS_ORIGINS` to your frontend domain(s)
- [ ] Set `NEXT_PUBLIC_API_URL` to your production API URL before building
- [ ] Configure HTTPS (via reverse proxy or hosting platform)
- [ ] Set up process management (systemd, Docker, or platform-specific)
- [ ] Run database migrations (`alembic upgrade head`)
- [ ] Seed or restore database data
- [ ] Verify the health endpoint: `GET /api/health`
- [ ] Set up database backups on a schedule
