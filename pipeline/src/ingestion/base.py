"""Shared ingestion plumbing.

The core dataset now arrives as a single f1db release download (see
`src/ingestion/f1db.py`), so there is no API pagination or request throttling
left for it. What remains here serves the Fast-F1 ingestors, which still fetch
session telemetry over the network and must be throttled.
"""

import logging
from abc import ABC, abstractmethod
from pathlib import Path

import fastf1
import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.config import settings
from src.db.models import Driver, RaceResult

logger = logging.getLogger(__name__)

# Delay between uncached Fast-F1 session loads (500 calls/hr rolling window).
THROTTLE_DELAY = 45  # seconds

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
    """Check if an exception is a Fast-F1 rate limit error."""
    err = str(e)
    return (
        "Too Many Requests" in err
        or "calls/h" in err
        or "429" in err
        or "RateLimitExceeded" in type(e).__name__
    )


class BaseIngestor(ABC):
    def __init__(self, db: Session):
        self.db = db
        # Fast-F1's enable_cache requires the directory to exist; create it so a
        # fresh environment (CI, cron, new clone) doesn't fail before ingesting.
        Path(settings.fastf1_cache_dir).mkdir(parents=True, exist_ok=True)
        fastf1.Cache.enable_cache(settings.fastf1_cache_dir)

    @abstractmethod
    def ingest(self) -> None:
        pass

    def log(self, message: str) -> None:
        logger.info(f"[{self.__class__.__name__}] {message}")

    def build_abbr_to_driver_id(
        self,
        session_results,
        code_to_id: dict[str, str],
    ) -> dict[str, str]:
        """Map Fast-F1 driver abbreviation to database driver_id.

        Fast-F1's own `DriverId` is an Ergast reference, which no longer matches
        our f1db-derived refs, so drivers are matched on their three-letter code.
        `code_to_id` must be scoped to the entrants of the race being loaded —
        codes are unique within a session but reused across eras.
        """
        abbr_to_id: dict[str, str] = {}
        if session_results is not None and not session_results.empty:
            for _, res in session_results.iterrows():
                abbr = clean(res.get("Abbreviation"))
                if abbr and str(abbr) in code_to_id:
                    abbr_to_id[str(abbr)] = code_to_id[str(abbr)]
        return abbr_to_id

    def race_entrant_codes(self, race_id: str) -> dict[str, str]:
        """Map driver code -> driver_id for the drivers entered in one race."""
        rows = self.db.execute(
            select(Driver.code, Driver.id)
            .join(RaceResult, RaceResult.driver_id == Driver.id)
            .where(RaceResult.race_id == race_id, Driver.code.isnot(None))
        ).all()
        return {code: driver_id for code, driver_id in rows}
