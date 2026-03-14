import logging
import time
from abc import ABC, abstractmethod

import fastf1
import pandas as pd
from sqlalchemy.orm import Session

from src.config import settings

logger = logging.getLogger(__name__)

# Delay between API calls to stay within Jolpica rate limits (200 req/hr ≈ 1 every 18s)
API_DELAY = 18.0

# Graceful shutdown flag — set by signal handlers in seed.py
_interrupted = False


def set_interrupted() -> None:
    global _interrupted
    _interrupted = True


def is_interrupted() -> bool:
    return _interrupted


def clean(val):
    """Convert pandas NaN/NaT to Python None."""
    if val is None:
        return None
    try:
        if pd.isna(val):
            return None
    except (ValueError, TypeError):
        pass
    return val


def api_call(fn, *args, **kwargs):
    """Call an Ergast API method with retry on rate limiting."""
    if _interrupted:
        raise InterruptedError("Seed interrupted by user")

    fn_name = getattr(fn, "__name__", str(fn))
    max_retries = 5
    for attempt in range(max_retries):
        try:
            start = time.time()
            result = fn(*args, **kwargs)
            elapsed = time.time() - start
            # Only delay if the call was slow (hit the network, not cache)
            if elapsed > 0.3:
                logger.info(f"API ← {fn_name} ({elapsed:.1f}s)")
                logger.info(f"⏳ Rate-limit delay ({API_DELAY:.0f}s)...")
                time.sleep(API_DELAY)
            else:
                logger.info(f"API ← {fn_name} ({elapsed:.1f}s, cached)")
            return result
        except KeyboardInterrupt:
            set_interrupted()
            raise InterruptedError("Seed interrupted by user")
        except Exception as e:
            err = str(e)
            if "Too Many Requests" in err or "calls/h" in err:
                wait = 60 * (attempt + 1)
                logger.warning(
                    f"Rate limited on {fn_name} (attempt {attempt + 1}/{max_retries}), "
                    f"waiting {wait}s before retry..."
                )
                try:
                    time.sleep(wait)
                except KeyboardInterrupt:
                    set_interrupted()
                    raise InterruptedError("Seed interrupted by user")
            else:
                raise
    # Final attempt without catching
    return fn(*args, **kwargs)


class BaseIngestor(ABC):
    def __init__(self, db: Session):
        self.db = db
        fastf1.Cache.enable_cache(settings.fastf1_cache_dir)

    @abstractmethod
    def ingest(self) -> None:
        pass

    def log(self, message: str) -> None:
        logger.info(f"[{self.__class__.__name__}] {message}")
