"""Shared ingestion plumbing.

The core dataset arrives as a single f1db release download (see
`src/ingestion/f1db.py`), so there is no API pagination or request throttling
left for it. What remains here is the database side of the Fast-F1 ingestors:
mapping a session's driver abbreviations onto our driver ids.

The Fast-F1 side — loading sessions, parsing them, and the rate-limit throttle
— lives in `src/ingestion/fastf1_sessions.py`, which imports nothing from the
database so it can also run on a host that has no access to one (a GitHub
runner fetching sessions the VPS is blocked from; see `fastf1_payload.py`).
`THROTTLE_DELAY` is re-exported here because that is where the licensing notes
say to find it.
"""

import logging
from abc import ABC, abstractmethod
from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.db.models import Driver, RaceResult
from src.ingestion.fastf1_sessions import (
    THROTTLE_DELAY,  # noqa: F401  re-exported: the rate-limit contract is looked for here
    enable_cache,
)

logger = logging.getLogger(__name__)

# Graceful shutdown flag — set by signal handlers in seed.py
_interrupted = False


def set_interrupted() -> None:
    global _interrupted
    _interrupted = True


def is_interrupted() -> bool:
    return _interrupted


def build_abbr_to_driver_id(
    abbrs: Iterable[str],
    code_to_id: dict[str, str],
) -> dict[str, str]:
    """Map Fast-F1 driver abbreviations to database driver ids.

    Fast-F1's own `DriverId` is an Ergast reference, which no longer matches
    our f1db-derived refs, so drivers are matched on their three-letter code.
    `code_to_id` must be scoped to the entrants of the race being loaded —
    codes are unique within a session but reused across eras.
    """
    return {str(abbr): code_to_id[str(abbr)] for abbr in abbrs if str(abbr) in code_to_id}


def race_entrant_codes(db: Session, race_id: str) -> dict[str, str]:
    """Map driver code -> driver_id for the drivers entered in one race."""
    rows = db.execute(
        select(Driver.code, Driver.id)
        .join(RaceResult, RaceResult.driver_id == Driver.id)
        .where(RaceResult.race_id == race_id, Driver.code.isnot(None))
    ).all()
    return {code: driver_id for code, driver_id in rows}


class BaseIngestor(ABC):
    def __init__(self, db: Session):
        self.db = db
        # Fast-F1's enable_cache requires the directory to exist; create it so a
        # fresh environment (CI, cron, new clone) doesn't fail before ingesting.
        enable_cache()

    @abstractmethod
    def ingest(self) -> None:
        pass

    def log(self, message: str) -> None:
        logger.info(f"[{self.__class__.__name__}] {message}")

    def build_abbr_to_driver_id(
        self,
        abbrs: Iterable[str],
        code_to_id: dict[str, str],
    ) -> dict[str, str]:
        return build_abbr_to_driver_id(abbrs, code_to_id)

    def race_entrant_codes(self, race_id: str) -> dict[str, str]:
        return race_entrant_codes(self.db, race_id)
