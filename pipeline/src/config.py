import json
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

    # Race Engineer chat. It stays off until the key, the model and the salt
    # are all set (see chat_enabled).
    anthropic_api_key: str = ""
    chat_model: str = ""
    # Salts the per-day hash of client IPs; never stored or logged raw.
    chat_ip_salt: str = ""
    chat_daily_budget_usd: float = 0.50
    chat_ip_per_10min: int = 10
    chat_ip_per_day: int = 60
    chat_max_tokens: int = 600
    # Dollars per million tokens, keyed by model id.
    chat_prices_json: str = (
        '{"claude-haiku-5-5": {"input": 0.10, "output": 0.50, '
        '"cache_write": 0.125, "cache_read": 0.01}}'
    )

    @property
    def chat_enabled(self) -> bool:
        """On only with a key, a model, a salt and a price for that model: an
        unpriced model would be billed without the budget ever seeing it."""
        return bool(
            self.anthropic_api_key
            and self.chat_model
            and self.chat_ip_salt
            and self.chat_model_priced
        )

    @property
    def chat_model_priced(self) -> bool:
        try:
            prices = json.loads(self.chat_prices_json)
        except ValueError:
            return False
        return isinstance(prices, dict) and self.chat_model in prices

    # The root .env is shared across frontend/backend/scripts, so ignore keys
    # this settings model doesn't declare (e.g. NEXT_PUBLIC_API_URL, STACK_NAME).
    # In Docker there is no .env at all — compose injects these as real env
    # vars, and a missing env_file is not an error.
    model_config = {
        "env_file": str(_ENV_FILE),
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


settings = Settings()
