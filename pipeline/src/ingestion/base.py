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

# Delay between uncached Fast-F1 session loads (500 calls/hr rolling window)
THROTTLE_DELAY = 45  # seconds

# Page size for Ergast pagination
PAGE_SIZE = 100

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


def timedelta_to_ms(val) -> int | None:
    """Convert a pandas Timedelta to milliseconds."""
    val = clean(val)
    if val is None:
        return None
    if isinstance(val, pd.Timedelta):
        return int(val.total_seconds() * 1000)
    return None


def is_rate_limit_error(e: Exception) -> bool:
    """Check if an exception is an API rate limit error (Ergast or Fast-F1)."""
    err = str(e)
    return (
        "Too Many Requests" in err
        or "calls/h" in err
        or "429" in err
        or "RateLimitExceeded" in type(e).__name__
    )


def safe_int(val) -> int | None:
    """Convert to int, returning None for NaN/NaT/invalid values."""
    val = clean(val)
    if val is None:
        return None
    try:
        return int(val)
    except (ValueError, TypeError):
        return None


def safe_float(val) -> float:
    """Convert to float, returning 0.0 for NaN/NaT/invalid values."""
    val = clean(val)
    if val is None:
        return 0.0
    try:
        return float(val)
    except (ValueError, TypeError):
        return 0.0


def safe_str(val) -> str | None:
    """Convert to string, returning None for NaN/NaT/empty values."""
    val = clean(val)
    if val is None:
        return None
    s = str(val)
    return s if s else None


def fetch_all_pages(method, **kwargs) -> pd.DataFrame:
    """Paginate through an Ergast simple-response endpoint."""
    frames = []
    offset = 0
    while True:
        df = api_call(method, limit=PAGE_SIZE, offset=offset, **kwargs)
        if df.empty:
            break
        frames.append(df)
        if len(df) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()


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
            if is_rate_limit_error(e):
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

    def build_abbr_to_driver_id(
        self,
        session_results,
        ref_to_id: dict[str, str],
    ) -> dict[str, str]:
        """Map Fast-F1 driver abbreviation to database driver_id."""
        abbr_to_id: dict[str, str] = {}
        if session_results is not None and not session_results.empty:
            for _, res in session_results.iterrows():
                abbr = clean(res.get("Abbreviation"))
                driver_ref = clean(res.get("DriverId"))
                if abbr and driver_ref and driver_ref in ref_to_id:
                    abbr_to_id[str(abbr)] = ref_to_id[driver_ref]
        return abbr_to_id
