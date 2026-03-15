"""Ingest lap time data from Fast-F1 (2018+ only)."""

import time
from datetime import date

import fastf1
import pandas as pd
from sqlalchemy import select

from src.db.models import Driver, LapTime, Race, Season
from src.ingestion.base import BaseIngestor, clean, is_interrupted

# Fast-F1 enforces 500 calls/hr (rolling 3600s window) for non-Ergast APIs.
# Each session.load() makes ~5-8 internal API calls, so we can do ~70 races/hr.
# Throttle: 3600s / 70 races ≈ 50s per race. We use 45s to stay safely under.
THROTTLE_DELAY = 45  # seconds between uncached session loads


def _timedelta_to_ms(val) -> int | None:
    """Convert a pandas Timedelta to milliseconds."""
    val = clean(val)
    if val is None:
        return None
    if isinstance(val, pd.Timedelta):
        return int(val.total_seconds() * 1000)
    return None


def _is_rate_limit_error(e: Exception) -> bool:
    """Check if an exception is a Fast-F1 rate limit error."""
    err = str(e)
    return "calls/h" in err or "RateLimitExceeded" in type(e).__name__


class LapTimeIngestor(BaseIngestor):
    """Ingest lap-by-lap data from Fast-F1 live timing (2018+ only).

    Uses Fast-F1's session.laps DataFrame which provides lap times,
    sector times, tyre compound, stint, and tyre life data from the
    OpenF1 live timing feed.
    """

    def ingest(self, year_range: tuple[int, int] | None = None) -> None:
        self.log("Fetching lap times (2018+)...")

        # Find races that already have lap times — skip them
        existing = set(
            self.db.execute(select(LapTime.race_id).group_by(LapTime.race_id)).scalars().all()
        )

        # Build driver ref -> driver_id lookup (ref matches Fast-F1's DriverId)
        drivers = self.db.execute(select(Driver)).scalars().all()
        ref_to_id: dict[str, str] = {d.ref: d.id for d in drivers}

        today = date.today()
        min_year = max(2018, year_range[0]) if year_range else 2018
        query = select(Season).where(Season.year >= min_year).order_by(Season.year)
        if year_range:
            query = query.where(Season.year <= year_range[1])
        seasons = self.db.execute(query).scalars().all()

        total_fetched = 0
        total_skipped = 0
        total_records = 0
        for season in seasons:
            races = (
                self.db.execute(
                    select(Race).where(Race.season_year == season.year).order_by(Race.round)
                )
                .scalars()
                .all()
            )

            # Skip entire season if all races already loaded
            race_ids = {r.id for r in races}
            if race_ids and race_ids.issubset(existing):
                total_skipped += len(races)
                continue

            season_fetched = 0
            for race in races:
                if is_interrupted():
                    break
                if race.id in existing:
                    total_skipped += 1
                    continue
                if race.date and race.date > today:
                    continue

                try:
                    self.log(f"{season.year} R{race.round}: fetching lap times...")
                    load_start = time.time()
                    session = fastf1.get_session(season.year, race.round, "R")
                    session.load(laps=True, telemetry=False, weather=False, messages=False)
                    load_elapsed = time.time() - load_start

                    laps = session.laps
                    if laps is None or laps.empty:
                        self.log(f"{season.year} R{race.round}: no lap data available")
                        continue

                    # Build abbreviation -> driver_id map from session results
                    abbr_to_id: dict[str, str] = {}
                    if session.results is not None and not session.results.empty:
                        for _, res in session.results.iterrows():
                            abbr = clean(res.get("Abbreviation"))
                            driver_ref = clean(res.get("DriverId"))
                            if abbr and driver_ref and driver_ref in ref_to_id:
                                abbr_to_id[str(abbr)] = ref_to_id[driver_ref]

                    if not abbr_to_id:
                        self.log(
                            f"{season.year} R{race.round}: no driver mapping available"
                        )
                        continue

                    race_records = 0
                    for _, row in laps.iterrows():
                        driver_abbr = str(row.get("Driver", ""))
                        driver_id = abbr_to_id.get(driver_abbr)
                        if not driver_id:
                            continue

                        lap_num = clean(row.get("LapNumber"))
                        if lap_num is None:
                            continue
                        lap_num = int(lap_num)

                        lap_id = f"{race.id}_L_{driver_id}_{lap_num}"
                        stint = clean(row.get("Stint"))
                        tyre_life = clean(row.get("TyreLife"))
                        lap_time = LapTime(
                            id=lap_id,
                            race_id=race.id,
                            driver_id=driver_id,
                            lap_number=lap_num,
                            time_millis=_timedelta_to_ms(row.get("LapTime")),
                            sector1_ms=_timedelta_to_ms(row.get("Sector1Time")),
                            sector2_ms=_timedelta_to_ms(row.get("Sector2Time")),
                            sector3_ms=_timedelta_to_ms(row.get("Sector3Time")),
                            compound=clean(row.get("Compound")),
                            stint=int(stint) if stint is not None else None,
                            tyre_life=int(tyre_life) if tyre_life is not None else None,
                        )
                        self.db.merge(lap_time)
                        race_records += 1

                    self.db.commit()
                    total_records += race_records
                    season_fetched += 1
                    total_fetched += 1
                    self.log(
                        f"{season.year} R{race.round}: {race_records} lap times ingested"
                    )

                    # Throttle: only delay if the load hit the network (not cached)
                    if load_elapsed > 1.0:
                        remaining = max(0, THROTTLE_DELAY - load_elapsed)
                        if remaining > 0:
                            self.log(f"⏳ Throttle delay ({remaining:.0f}s)...")
                            try:
                                time.sleep(remaining)
                            except KeyboardInterrupt:
                                raise InterruptedError("Seed interrupted by user")

                except InterruptedError:
                    raise
                except KeyboardInterrupt:
                    raise InterruptedError("Seed interrupted by user")
                except Exception as e:
                    self.db.rollback()
                    if _is_rate_limit_error(e):
                        self.log(
                            f"{season.year} R{race.round}: rate limited, "
                            f"stopping lap time ingestion. Re-run later to continue."
                        )
                        # Commit progress and return — no point retrying within same process
                        # since the rolling window needs time to clear
                        self.log(
                            f"Ingested {total_records} lap times from {total_fetched} races "
                            f"({total_skipped} skipped) before rate limit"
                        )
                        return
                    else:
                        self.log(
                            f"Lap times {season.year} R{race.round}: ERROR - {e}"
                        )
                        continue

            if is_interrupted():
                break
            if season_fetched > 0:
                self.log(f"Season {season.year}: {season_fetched} races with lap times ingested")

        self.log(
            f"Ingested {total_records} lap times from {total_fetched} races ({total_skipped} skipped)"
        )
