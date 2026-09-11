"""Ingest qualifying sector times from Fast-F1 (2018+ only).

Two entry points onto the same writer:

* `QualifyingSectorIngestor` — fetch and write in one process, for a host whose
  IP Fast-F1 still answers.
* `write_quali_sectors` — write bests someone else fetched, used by
  `scripts/fastf1_import.py` when the payload was built off-box.
"""

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.db.models import QualifyingResult, Race, Season
from src.ingestion.base import BaseIngestor, is_interrupted
from src.ingestion.fastf1_sessions import (
    fetch_qualifying_bests,
    is_blocked_error,
    is_rate_limit_error,
    throttle,
)

# Fast-F1's live timing archive starts here; before it there are no sector times.
FIRST_SECTOR_DATA_YEAR = 2018

# Qualifying segment -> the QualifyingResult columns it fills.
_SEGMENT_COLUMNS = {
    "Q1": ("q1_s1_ms", "q1_s2_ms", "q1_s3_ms"),
    "Q2": ("q2_s1_ms", "q2_s2_ms", "q2_s3_ms"),
    "Q3": ("q3_s1_ms", "q3_s2_ms", "q3_s3_ms"),
}


def races_with_quali_sectors(db: Session) -> set[str]:
    """Ids of races whose qualifying results already carry sector times."""
    return set(
        db.execute(
            select(QualifyingResult.race_id)
            .where(QualifyingResult.q1_s1_ms.isnot(None))
            .group_by(QualifyingResult.race_id)
        )
        .scalars()
        .all()
    )


def races_with_quali_results(db: Session) -> set[str]:
    """Ids of races that have qualifying results at all.

    Sector times update existing rows, so a race without them has nothing to
    attach to and is not worth fetching.
    """
    return set(
        db.execute(select(QualifyingResult.race_id).group_by(QualifyingResult.race_id))
        .scalars()
        .all()
    )


def write_quali_sectors(
    db: Session,
    race_id: str,
    bests: dict[str, dict],
    abbr_to_id: dict[str, str],
) -> int:
    """Fill sector columns on this race's qualifying rows. The caller commits.

    `bests` is `{abbreviation: {"Q1": {"s1_ms": ..., "lap_ms": ...}, ...}}` as
    produced by `fastf1_sessions.extract_qualifying_bests`.
    """
    quali_by_driver = {
        q.driver_id: q
        for q in db.execute(select(QualifyingResult).where(QualifyingResult.race_id == race_id))
        .scalars()
        .all()
    }
    if not quali_by_driver:
        return 0

    updated = 0
    for abbr, segments in bests.items():
        driver_id = abbr_to_id.get(str(abbr))
        if not driver_id:
            continue
        quali = quali_by_driver.get(driver_id)
        if not quali:
            continue

        touched = False
        for segment, (s1_col, s2_col, s3_col) in _SEGMENT_COLUMNS.items():
            best = segments.get(segment)
            if not best:
                continue
            setattr(quali, s1_col, best.get("s1_ms"))
            setattr(quali, s2_col, best.get("s2_ms"))
            setattr(quali, s3_col, best.get("s3_ms"))
            touched = True

        if touched:
            updated += 1
    return updated


class QualifyingSectorIngestor(BaseIngestor):
    """Ingest qualifying sector times from Fast-F1 live timing (2018+ only).

    Populates sector columns (q1_s1_ms .. q3_s3_ms) on existing
    QualifyingResult rows using Fast-F1's session.laps DataFrame.

    Requires an IP Fast-F1 will serve. The VPS's is blocked, so in production
    this runs as fetch-elsewhere + `scripts/fastf1_import.py`; see
    `docs/DEPLOYMENT.md`.
    """

    def ingest(self, year_range: tuple[int, int] | None = None) -> None:
        self.log("Fetching qualifying sectors (2018+)...")

        # Find races that already have qualifying sector data — skip them
        existing = races_with_quali_sectors(self.db)
        have_quali = races_with_quali_results(self.db)

        today = date.today()
        min_year = (
            max(FIRST_SECTOR_DATA_YEAR, year_range[0]) if year_range else FIRST_SECTOR_DATA_YEAR
        )
        query = select(Season).where(Season.year >= min_year).order_by(Season.year)
        if year_range:
            query = query.where(Season.year <= year_range[1])
        seasons = self.db.execute(query).scalars().all()

        total_fetched = 0
        total_skipped = 0
        total_updated = 0
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
                # Sector times update existing qualifying rows; without them
                # there is nothing to fill in.
                if race.id not in have_quali:
                    continue

                try:
                    self.log(f"{season.year} R{race.round}: fetching qualifying sectors...")
                    abbrs, bests, load_elapsed = fetch_qualifying_bests(season.year, race.round)

                    if not bests:
                        self.log(f"{season.year} R{race.round}: no qualifying lap data")
                        continue

                    abbr_to_id = self.build_abbr_to_driver_id(
                        abbrs, self.race_entrant_codes(race.id)
                    )
                    if not abbr_to_id:
                        self.log(f"{season.year} R{race.round}: no driver mapping")
                        continue

                    race_updated = write_quali_sectors(self.db, race.id, bests, abbr_to_id)
                    self.db.commit()

                    total_updated += race_updated
                    season_fetched += 1
                    total_fetched += 1
                    self.log(
                        f"{season.year} R{race.round}: {race_updated} qualifying sectors updated"
                    )

                    # Throttle uncached loads
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
                            f"stopping. Re-run later to continue."
                        )
                        self.log(
                            f"Updated {total_updated} qualifying results "
                            f"from {total_fetched} races "
                            f"({total_skipped} skipped) before rate limit"
                        )
                        return
                    else:
                        self.log(f"Qualifying sectors {season.year} R{race.round}: ERROR - {e}")
                        continue

            if is_interrupted():
                break
            if season_fetched > 0:
                self.log(f"Season {season.year}: {season_fetched} qualifying sectors ingested")

        self.log(
            f"Updated {total_updated} qualifying results from "
            f"{total_fetched} races ({total_skipped} skipped)"
        )
