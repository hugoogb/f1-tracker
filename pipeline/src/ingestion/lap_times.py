"""Ingest lap time data from Fast-F1 (2018+ only).

Two entry points onto the same writer:

* `LapTimeIngestor` — fetch and write in one process, for a host whose IP
  Fast-F1 still answers (a laptop, a fresh local seed).
* `write_lap_rows` — write rows someone else fetched, used by
  `scripts/fastf1_import.py` when the payload was built off-box.
"""

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.db.models import LapTime, Race, Season
from src.ingestion.base import BaseIngestor, is_interrupted
from src.ingestion.fastf1_sessions import (
    EMPTY_STREAK_LIMIT,
    fetch_race_laps,
    is_blocked_error,
    is_rate_limit_error,
    throttle,
)

# Fast-F1's live timing archive starts here; before it there is no lap data.
FIRST_LAP_DATA_YEAR = 2018


def races_with_lap_times(db: Session) -> set[str]:
    """Ids of races that already have lap times stored."""
    return set(db.execute(select(LapTime.race_id).group_by(LapTime.race_id)).scalars().all())


def write_lap_rows(
    db: Session,
    race_id: str,
    rows: list[dict],
    abbr_to_id: dict[str, str],
) -> int:
    """Merge extracted lap rows into `lap_times`. The caller commits.

    Rows are keyed by driver abbreviation (see `fastf1_sessions`); anything
    whose abbreviation is not among this race's entrants is skipped, which is
    how a code reused across eras stays harmless.
    """
    written = 0
    for row in rows:
        driver_id = abbr_to_id.get(str(row.get("driver") or ""))
        if not driver_id:
            continue
        lap_num = row.get("lap_number")
        if lap_num is None:
            continue
        lap_num = int(lap_num)

        db.merge(
            LapTime(
                id=f"{race_id}_L_{driver_id}_{lap_num}",
                race_id=race_id,
                driver_id=driver_id,
                lap_number=lap_num,
                time_millis=row.get("time_millis"),
                sector1_ms=row.get("sector1_ms"),
                sector2_ms=row.get("sector2_ms"),
                sector3_ms=row.get("sector3_ms"),
                compound=row.get("compound"),
                stint=row.get("stint"),
                tyre_life=row.get("tyre_life"),
            )
        )
        written += 1
    return written


class LapTimeIngestor(BaseIngestor):
    """Ingest lap-by-lap data from Fast-F1 live timing (2018+ only).

    Uses Fast-F1's session.laps DataFrame, which provides lap times, sector
    times, tyre compound, stint and tyre life from Formula 1's own live timing
    archive. This is the only source for lap-level and tyre-compound data —
    f1db's finest granularity is one row per driver per session.

    Requires an IP Fast-F1 will serve. The VPS's is blocked, so in production
    this runs as fetch-elsewhere + `scripts/fastf1_import.py`; see
    `docs/DEPLOYMENT.md`.
    """

    def ingest(self, year_range: tuple[int, int] | None = None) -> None:
        self.log("Fetching lap times (2018+)...")

        # Find races that already have lap times — skip them
        existing = races_with_lap_times(self.db)

        today = date.today()
        min_year = max(FIRST_LAP_DATA_YEAR, year_range[0]) if year_range else FIRST_LAP_DATA_YEAR
        query = select(Season).where(Season.year >= min_year).order_by(Season.year)
        if year_range:
            query = query.where(Season.year <= year_range[1])
        seasons = self.db.execute(query).scalars().all()

        total_fetched = 0
        total_skipped = 0
        total_records = 0
        # Fast-F1 answers a refused request with a warning and no laps, so a run
        # of empty sessions is how a blocked host looks from in here.
        empty_streak = 0
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
                    abbrs, rows, load_elapsed = fetch_race_laps(season.year, race.round)

                    if not rows:
                        self.log(f"{season.year} R{race.round}: no lap data available")
                        empty_streak += 1
                        if empty_streak >= EMPTY_STREAK_LIMIT:
                            self.log(
                                f"{empty_streak} sessions in a row came back empty — "
                                f"Fast-F1 is most likely refusing this host. Fetch "
                                f"elsewhere and load with scripts/fastf1_import.py; "
                                f"see docs/DEPLOYMENT.md."
                            )
                            return
                        throttle(load_elapsed, log=self.log)
                        continue
                    empty_streak = 0

                    abbr_to_id = self.build_abbr_to_driver_id(
                        abbrs, self.race_entrant_codes(race.id)
                    )
                    if not abbr_to_id:
                        self.log(f"{season.year} R{race.round}: no driver mapping available")
                        continue

                    race_records = write_lap_rows(self.db, race.id, rows, abbr_to_id)
                    self.db.commit()

                    total_records += race_records
                    season_fetched += 1
                    total_fetched += 1
                    self.log(f"{season.year} R{race.round}: {race_records} lap times ingested")

                    # Throttle: only delay if the load hit the network (not cached)
                    throttle(load_elapsed, log=self.log)

                except InterruptedError:
                    raise
                except KeyboardInterrupt:
                    raise InterruptedError("Seed interrupted by user")
                except Exception as e:
                    self.db.rollback()
                    if is_blocked_error(e):
                        self.log(
                            f"{season.year} R{race.round}: Fast-F1 refused this host "
                            f"({e}). Fetch the sessions somewhere else and load them "
                            f"with scripts/fastf1_import.py — see docs/DEPLOYMENT.md."
                        )
                        return
                    if is_rate_limit_error(e):
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
                        self.log(f"Lap times {season.year} R{race.round}: ERROR - {e}")
                        continue

            if is_interrupted():
                break
            if season_fetched > 0:
                self.log(f"Season {season.year}: {season_fetched} races with lap times ingested")

        self.log(
            f"Ingested {total_records} lap times from {total_fetched} races ({total_skipped} skipped)"
        )
