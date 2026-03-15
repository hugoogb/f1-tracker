"""Ingest qualifying sector times from Fast-F1 (2018+ only)."""

import time
from datetime import date

import fastf1
import pandas as pd
from sqlalchemy import select

from src.db.models import Driver, QualifyingResult, Race, Season
from src.ingestion.base import BaseIngestor, clean, is_interrupted

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
    err = str(e)
    return "calls/h" in err or "RateLimitExceeded" in type(e).__name__


class QualifyingSectorIngestor(BaseIngestor):
    """Ingest qualifying sector times from Fast-F1 live timing (2018+ only).

    Populates sector columns (q1_s1_ms .. q3_s3_ms) on existing
    QualifyingResult rows using Fast-F1's session.laps DataFrame.
    """

    def ingest(self, year_range: tuple[int, int] | None = None) -> None:
        self.log("Fetching qualifying sectors (2018+)...")

        # Find races that already have qualifying sector data — skip them
        existing = set(
            self.db.execute(
                select(QualifyingResult.race_id)
                .where(QualifyingResult.q1_s1_ms.isnot(None))
                .group_by(QualifyingResult.race_id)
            )
            .scalars()
            .all()
        )

        # Build driver ref -> driver_id lookup
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
        total_updated = 0
        for season in seasons:
            races = (
                self.db.execute(
                    select(Race)
                    .where(Race.season_year == season.year)
                    .order_by(Race.round)
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

                # Check if qualifying results exist for this race
                quali_results = (
                    self.db.execute(
                        select(QualifyingResult)
                        .where(QualifyingResult.race_id == race.id)
                    )
                    .scalars()
                    .all()
                )
                if not quali_results:
                    continue

                try:
                    self.log(
                        f"{season.year} R{race.round}: "
                        f"fetching qualifying sectors..."
                    )
                    load_start = time.time()
                    session = fastf1.get_session(
                        season.year, race.round, "Q"
                    )
                    session.load(
                        laps=True,
                        telemetry=False,
                        weather=False,
                        messages=False,
                    )
                    load_elapsed = time.time() - load_start

                    laps = session.laps
                    if laps is None or laps.empty:
                        self.log(
                            f"{season.year} R{race.round}: "
                            f"no qualifying lap data"
                        )
                        continue

                    # Build abbreviation -> driver_id map
                    abbr_to_id: dict[str, str] = {}
                    if (
                        session.results is not None
                        and not session.results.empty
                    ):
                        for _, res in session.results.iterrows():
                            abbr = clean(res.get("Abbreviation"))
                            driver_ref = clean(res.get("DriverId"))
                            if (
                                abbr
                                and driver_ref
                                and driver_ref in ref_to_id
                            ):
                                abbr_to_id[str(abbr)] = ref_to_id[
                                    driver_ref
                                ]

                    if not abbr_to_id:
                        self.log(
                            f"{season.year} R{race.round}: "
                            f"no driver mapping"
                        )
                        continue

                    # Split laps into Q1/Q2/Q3 sessions
                    try:
                        q_parts = laps.split_qualifying_sessions()
                    except Exception:
                        self.log(
                            f"{season.year} R{race.round}: "
                            f"could not split qualifying sessions"
                        )
                        continue

                    # For each driver, find best lap per Q session
                    driver_sectors: dict[
                        str,
                        dict[
                            str,
                            tuple[
                                int | None,
                                int | None,
                                int | None,
                                int | None,
                            ],
                        ],
                    ] = {}

                    for q_label, q_laps in zip(
                        ["Q1", "Q2", "Q3"], q_parts
                    ):
                        if q_laps is None or q_laps.empty:
                            continue
                        for _, row in q_laps.iterrows():
                            abbr = str(row.get("Driver", ""))
                            driver_id = abbr_to_id.get(abbr)
                            if not driver_id:
                                continue

                            lap_time = _timedelta_to_ms(
                                row.get("LapTime")
                            )
                            if lap_time is None:
                                continue

                            s1 = _timedelta_to_ms(
                                row.get("Sector1Time")
                            )
                            s2 = _timedelta_to_ms(
                                row.get("Sector2Time")
                            )
                            s3 = _timedelta_to_ms(
                                row.get("Sector3Time")
                            )

                            if driver_id not in driver_sectors:
                                driver_sectors[driver_id] = {}
                            current = driver_sectors[
                                driver_id
                            ].get(q_label)
                            # Keep the lap with the fastest time
                            if current is None or (
                                current[3] is not None
                                and lap_time < current[3]
                            ):
                                driver_sectors[driver_id][
                                    q_label
                                ] = (s1, s2, s3, lap_time)

                    # Update QualifyingResult rows with sector data
                    race_updated = 0
                    quali_by_driver = {
                        q.driver_id: q for q in quali_results
                    }
                    for driver_id, sessions in driver_sectors.items():
                        quali = quali_by_driver.get(driver_id)
                        if not quali:
                            continue

                        q1 = sessions.get("Q1")
                        if q1:
                            quali.q1_s1_ms = q1[0]
                            quali.q1_s2_ms = q1[1]
                            quali.q1_s3_ms = q1[2]

                        q2 = sessions.get("Q2")
                        if q2:
                            quali.q2_s1_ms = q2[0]
                            quali.q2_s2_ms = q2[1]
                            quali.q2_s3_ms = q2[2]

                        q3 = sessions.get("Q3")
                        if q3:
                            quali.q3_s1_ms = q3[0]
                            quali.q3_s2_ms = q3[1]
                            quali.q3_s3_ms = q3[2]

                        race_updated += 1

                    self.db.commit()
                    total_updated += race_updated
                    season_fetched += 1
                    total_fetched += 1
                    self.log(
                        f"{season.year} R{race.round}: "
                        f"{race_updated} qualifying sectors updated"
                    )

                    # Throttle uncached loads
                    if load_elapsed > 1.0:
                        remaining = max(0, THROTTLE_DELAY - load_elapsed)
                        if remaining > 0:
                            self.log(
                                f"Throttle delay ({remaining:.0f}s)..."
                            )
                            try:
                                time.sleep(remaining)
                            except KeyboardInterrupt:
                                raise InterruptedError(
                                    "Seed interrupted by user"
                                )

                except InterruptedError:
                    raise
                except KeyboardInterrupt:
                    raise InterruptedError("Seed interrupted by user")
                except Exception as e:
                    self.db.rollback()
                    if _is_rate_limit_error(e):
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
                        self.log(
                            f"Qualifying sectors {season.year} "
                            f"R{race.round}: ERROR - {e}"
                        )
                        continue

            if is_interrupted():
                break
            if season_fetched > 0:
                self.log(
                    f"Season {season.year}: "
                    f"{season_fetched} qualifying sectors ingested"
                )

        self.log(
            f"Updated {total_updated} qualifying results from "
            f"{total_fetched} races ({total_skipped} skipped)"
        )
