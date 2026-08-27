# syntax=docker/dockerfile:1
#
# F1 Tracker backend image — serves the FastAPI app and doubles as the runner
# for Alembic migrations and the data pipeline (scripts/seed.py).
#
# Build context is `pipeline/` (see docker/compose.prod.yml):
#   docker build -f pipeline/Dockerfile -t f1-tracker-api:latest pipeline

ARG PYTHON_IMAGE=python:3.12-slim-bookworm

# ---------- Stage 1: resolve dependencies into a virtualenv ----------
FROM ${PYTHON_IMAGE} AS builder

# Same base as the runtime stage, so the venv copied across stays valid.
COPY --from=ghcr.io/astral-sh/uv:0.10 /uv /uvx /usr/local/bin/

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/app/.venv

WORKDIR /app

# `pipeline` has no [build-system], so it is a virtual project: uv installs the
# locked dependencies and nothing else. This layer is cached until the lockfile
# changes, so editing src/ doesn't re-resolve the dependency tree.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# ---------- Stage 2: runtime ----------
FROM ${PYTHON_IMAGE} AS runtime

LABEL org.opencontainers.image.title="f1-tracker-api" \
      org.opencontainers.image.description="F1 Tracker FastAPI backend and data pipeline" \
      org.opencontainers.image.source="https://github.com/hugoogb/f1-tracker"

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/app/.venv/bin:$PATH" \
    # Fast-F1 writes a lot; keep it on a volume rather than the container layer.
    FASTF1_CACHE_DIR=/app/.fastf1_cache \
    # uvicorn worker count — 2 suits a small VPS shared with other projects.
    API_WORKERS=2

# tini reaps zombies and forwards SIGTERM so uvicorn shuts down cleanly;
# curl backs the container healthcheck.
RUN apt-get update \
    && apt-get install -y --no-install-recommends tini curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 app \
    && useradd --uid 10001 --gid app --create-home --shell /usr/sbin/nologin app

WORKDIR /app

COPY --from=builder --chown=app:app /app/.venv /app/.venv
# alembic.ini sets `prepend_sys_path = .`, and uvicorn/python resolve `src.*`
# from the working directory, so the source tree lives at /app rather than in
# site-packages.
COPY --chown=app:app alembic.ini ./
COPY --chown=app:app alembic ./alembic
COPY --chown=app:app src ./src
COPY --chown=app:app scripts ./scripts

RUN install -d -o app -g app /app/.fastf1_cache

USER app

EXPOSE 8000

# Liveness only — /api/health does not touch PostgreSQL, so a database blip
# doesn't mark a perfectly healthy API as dead. /api/health/db is the readiness
# probe (used by scripts/vps/deploy.sh).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/api/health || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["sh", "-c", "exec uvicorn src.api.main:app --host 0.0.0.0 --port 8000 --workers ${API_WORKERS} --proxy-headers --forwarded-allow-ips '*'"]
