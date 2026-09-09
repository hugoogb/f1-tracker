from pathlib import Path

from pydantic_settings import BaseSettings

# Resolve the repo-root .env absolutely so it loads regardless of the current
# working directory (this file lives at pipeline/src/config.py → repo root is 2 up).
_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    database_url: str = "postgresql://f1tracker:f1tracker_dev@localhost:5432/f1tracker"
    fastapi_host: str = "0.0.0.0"
    fastapi_port: int = 8000
    fastapi_debug: bool = True
    fastf1_cache_dir: str = ".fastf1_cache"
    cors_origins: str = "http://localhost:3000"

    # f1db release to ingest. "latest" tracks the newest published release;
    # pin an exact tag (e.g. "v2026.5.0") for reproducible seeds.
    f1db_version: str = "latest"
    f1db_cache_dir: str = ".f1db_cache"

    # The root .env is shared across frontend/backend/scripts, so ignore keys
    # this settings model doesn't declare (e.g. NEXT_PUBLIC_API_URL, NEON_DATABASE_URL).
    model_config = {
        "env_file": str(_ENV_FILE),
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


settings = Settings()
