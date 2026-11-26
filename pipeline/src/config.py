import json
from pathlib import Path

from pydantic_settings import BaseSettings

_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    database_url: str = "postgresql://f1tracker:f1tracker_dev@localhost:5432/f1tracker"
    fastapi_host: str = "0.0.0.0"
    fastapi_port: int = 8000
    fastapi_debug: bool = True
    fastf1_cache_dir: str = ".fastf1_cache"
    cors_origins: str = "http://localhost:3000"

    f1db_version: str = "latest"
    f1db_cache_dir: str = ".f1db_cache"

    anthropic_api_key: str = ""
    chat_model: str = ""
    chat_ip_salt: str = ""
    chat_daily_budget_usd: float = 0.50
    chat_ip_per_10min: int = 10
    chat_ip_per_day: int = 60
    chat_max_tokens: int = 600
    chat_prices_json: str = (
        '{"claude-haiku-5-5": {"input": 0.10, "output": 0.50, '
        '"cache_write": 0.125, "cache_read": 0.01}}'
    )

    @property
    def chat_enabled(self) -> bool:
        """On only with a key, a model, a salt and a price for that model: an
        unpriced model would be billed without the budget ever seeing it. A
        whitespace-only value is unset: an env file line like `CHAT_MODEL= `
        must not switch the chat on."""
        return bool(
            self.anthropic_api_key.strip()
            and self.chat_model.strip()
            and self.chat_ip_salt.strip()
            and self.chat_model_priced
        )

    @property
    def chat_model_priced(self) -> bool:
        try:
            prices = json.loads(self.chat_prices_json)
        except ValueError:
            return False
        return isinstance(prices, dict) and self.chat_model in prices

    model_config = {
        "env_file": str(_ENV_FILE),
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


settings = Settings()
