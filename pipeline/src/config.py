from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://f1tracker:f1tracker_dev@localhost:5432/f1tracker"
    fastapi_host: str = "0.0.0.0"
    fastapi_port: int = 8000
    fastapi_debug: bool = True
    fastf1_cache_dir: str = ".fastf1_cache"

    model_config = {"env_file": "../../.env", "env_file_encoding": "utf-8"}


settings = Settings()
