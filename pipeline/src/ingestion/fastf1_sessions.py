"""Fast-F1 session extraction — network in, JSON-safe dicts out, no database.

Formula 1's live timing endpoints refuse the VPS's datacentre IP, so the host
that *fetches* session data is no longer the host that *writes* it to
PostgreSQL. Everything Fast-F1-shaped therefore lives here, keyed by the
three-letter driver abbreviation and carrying only JSON-safe values:

* `lap_times.py` / `qualifying_sectors.py` call these directly when the local
  IP can reach Fast-F1 (a laptop, a fresh seed).
* `scripts/fastf1_fetch.py` calls the same functions on a GitHub runner and
  writes the results to a payload (`fastf1_payload.py`) that
  `scripts/fastf1_import.py` loads on the box.

One parser, two transports — so the offline path can never drift from the
direct one.
"""

import logging
import time
from pathlib import Path

import fastf1
import pandas as pd

from src.config import settings

logger = logging.getLogger(__name__)

# Delay between uncached Fast-F1 session loads (500 calls/hr rolling window).
# Required by Fast-F1's terms of use — see the licensing notes in CLAUDE.md.
THROTTLE_DELAY = 45  # seconds

# A load that returns this fast came off the cache and cost no API call, so it
# does not need to be throttled.
CACHED_LOAD_SECONDS = 1.0

# Fast-F1 session identifiers for the data this pipeline ingests.
SESSION_RACE = "R"
SESSION_QUALIFYING = "Q"


_cache_enabled = False


def enable_cache() -> None:
    """Point Fast-F1 at the configured cache directory, creating it if needed.

    Called before every load, so it only does the work once per process.
    """
    global _cache_enabled
    if _cache_enabled:
        return
    Path(settings.fastf1_cache_dir).mkdir(parents=True, exist_ok=True)
    fastf1.Cache.enable_cache(settings.fastf1_cache_dir)
    _cache_enabled = True


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


def is_blocked_error(e: Exception) -> bool:
    """Check whether Fast-F1 was refused outright rather than rate limited.

    Formula 1 blocks whole IP ranges (the VPS is in one), which surfaces as a
    403 or a connection reset rather than the 429 `is_rate_limit_error` covers.
    Worth distinguishing: a rate limit clears on its own, a block does not.
    """
    err = str(e).lower()
    return (
        "403" in err
        or "forbidden" in err
        or "connection reset" in err
        or "connection aborted" in err
        or ("ssl" in err and "handshake" in err)
    )


def throttle(load_elapsed: float, log=logger.info) -> None:
    """Sleep out the remainder of the rate-limit window after a network load.

    Cached loads (fast ones) cost no API call and are not delayed.
    """
    if load_elapsed <= CACHED_LOAD_SECONDS:
        return
    remaining = max(0.0, THROTTLE_DELAY - load_elapsed)
    if remaining <= 0:
        return
    log(f"Throttle delay ({remaining:.0f}s)...")
    try:
        time.sleep(remaining)
    except KeyboardInterrupt:
        raise InterruptedError("Interrupted during throttle delay")


def _load(year: int, rnd: int, session_id: str):
    """Load one session's lap data, returning it with how long the load took."""
    enable_cache()
    start = time.time()
    session = fastf1.get_session(year, rnd, session_id)
    session.load(laps=True, telemetry=False, weather=False, messages=False)
    return session, time.time() - start


def session_abbreviations(session) -> list[str]:
    """The three-letter codes of the drivers classified in a session.

    Fast-F1's own `DriverId` is an Ergast reference, which no longer matches
    our f1db-derived refs, so drivers are matched on this code instead.
    """
    results = session.results
    if results is None or results.empty:
        return []
    abbrs: list[str] = []
    for _, res in results.iterrows():
        abbr = clean(res.get("Abbreviation"))
        if abbr:
            abbrs.append(str(abbr))
    return abbrs


def extract_race_laps(session) -> list[dict]:
    """Flatten a race session's laps into JSON-safe rows keyed by abbreviation."""
    laps = session.laps
    if laps is None or laps.empty:
        return []

    rows: list[dict] = []
    for _, row in laps.iterrows():
        lap_num = clean(row.get("LapNumber"))
        if lap_num is None:
            continue
        driver = clean(row.get("Driver"))
        if not driver:
            continue

        stint = clean(row.get("Stint"))
        tyre_life = clean(row.get("TyreLife"))
        compound = clean(row.get("Compound"))
        rows.append(
            {
                "driver": str(driver),
                "lap_number": int(lap_num),
                "time_millis": timedelta_to_ms(row.get("LapTime")),
                "sector1_ms": timedelta_to_ms(row.get("Sector1Time")),
                "sector2_ms": timedelta_to_ms(row.get("Sector2Time")),
                "sector3_ms": timedelta_to_ms(row.get("Sector3Time")),
                "compound": str(compound) if compound is not None else None,
                "stint": int(stint) if stint is not None else None,
                "tyre_life": int(tyre_life) if tyre_life is not None else None,
            }
        )
    return rows


def extract_qualifying_bests(session) -> dict[str, dict[str, dict]]:
    """Each driver's fastest lap per qualifying segment, with its sector times.

    Returns `{abbreviation: {"Q1": {"s1_ms": ..., "lap_ms": ...}, ...}}`.
    """
    laps = session.laps
    if laps is None or laps.empty:
        return {}

    try:
        segments = laps.split_qualifying_sessions()
    except Exception as e:  # Fast-F1 raises bare exceptions for odd sessions
        logger.debug(f"Could not split qualifying sessions: {e}")
        return {}

    bests: dict[str, dict[str, dict]] = {}
    for label, segment_laps in zip(["Q1", "Q2", "Q3"], segments):
        if segment_laps is None or segment_laps.empty:
            continue
        for _, row in segment_laps.iterrows():
            driver = clean(row.get("Driver"))
            if not driver:
                continue
            lap_ms = timedelta_to_ms(row.get("LapTime"))
            if lap_ms is None:
                continue

            current = bests.setdefault(str(driver), {}).get(label)
            if current is not None and current["lap_ms"] <= lap_ms:
                continue
            bests[str(driver)][label] = {
                "s1_ms": timedelta_to_ms(row.get("Sector1Time")),
                "s2_ms": timedelta_to_ms(row.get("Sector2Time")),
                "s3_ms": timedelta_to_ms(row.get("Sector3Time")),
                "lap_ms": lap_ms,
            }
    return bests


def fetch_race_laps(year: int, rnd: int) -> tuple[list[str], list[dict], float]:
    """Fetch one race's laps: `(abbreviations, lap rows, load seconds)`."""
    session, elapsed = _load(year, rnd, SESSION_RACE)
    return session_abbreviations(session), extract_race_laps(session), elapsed


def fetch_qualifying_bests(year: int, rnd: int) -> tuple[list[str], dict[str, dict], float]:
    """Fetch one qualifying session's best laps: `(abbreviations, bests, seconds)`."""
    session, elapsed = _load(year, rnd, SESSION_QUALIFYING)
    return session_abbreviations(session), extract_qualifying_bests(session), elapsed
