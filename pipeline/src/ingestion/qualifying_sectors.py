"""Ingest qualifying sector times from Fast-F1 (2018+ only)."""

import time
from datetime import date

import fastf1
from sqlalchemy import select

from src.db.models import Driver, QualifyingResult, Race, Season
from src.ingestion.base import (
    THROTTLE_DELAY,
    BaseIngestor,
    is_interrupted,
    is_rate_limit_error,
    timedelta_to_ms,
)


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

                # Check if qualifying results exist for this race
                quali_results = (
                    self.db.execute(
                        select(QualifyingResult).where(QualifyingResult.race_id == race.id)
                    )
                    .scalars()
                    .all()
                )
                if not quali_results:
                    continue

                try:
                    self.log(f"{season.year} R{race.round}: fetching qualifying sectors...")
                    load_start = time.time()
                    session = fastf1.get_session(season.year, race.round, "Q")
                    session.load(
                        laps=True,
                        telemetry=False,
                        weather=False,
                        messages=False,
                    )
                    load_elapsed = time.time() - load_start

                    laps = session.laps
                    if laps is None or laps.empty:
                        self.log(f"{season.year} R{race.round}: no qualifying lap data")
                        continue

                    # Build abbreviation -> driver_id map
                    abbr_to_id = self.build_abbr_to_driver_id(session.results, ref_to_id)

                    if not abbr_to_id:
                        self.log(f"{season.year} R{race.round}: no driver mapping")
                        continue

                    # Split laps into Q1/Q2/Q3 sessions
                    try:
                        q_parts = laps.split_qualifying_sessions()
                    except Exception:
                        self.log(
                            f"{season.year} R{race.round}: could not split qualifying sessions"
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

                    for q_label, q_laps in zip(["Q1", "Q2", "Q3"], q_parts):
                        if q_laps is None or q_laps.empty:
                            continue
                        for _, row in q_laps.iterrows():
                            abbr = str(row.get("Driver", ""))
                            driver_id = abbr_to_id.get(abbr)
                            if not driver_id:
                                continue

                            lap_time = timedelta_to_ms(row.get("LapTime"))
                            if lap_time is None:
                                continue

                            s1 = timedelta_to_ms(row.get("Sector1Time"))
                            s2 = timedelta_to_ms(row.get("Sector2Time"))
                            s3 = timedelta_to_ms(row.get("Sector3Time"))

                            if driver_id not in driver_sectors:
                                driver_sectors[driver_id] = {}
                            current = driver_sectors[driver_id].get(q_label)
                            # Keep the lap with the fastest time
                            if current is None or (
                                current[3] is not None and lap_time < current[3]
                            ):
                                driver_sectors[driver_id][q_label] = (s1, s2, s3, lap_time)

                    # Update QualifyingResult rows with sector data
                    race_updated = 0
                    quali_by_driver = {q.driver_id: q for q in quali_results}
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
                        f"{season.year} R{race.round}: {race_updated} qualifying sectors updated"
                    )

                    # Throttle uncached loads
                    if load_elapsed > 1.0:
                        remaining = max(0, THROTTLE_DELAY - load_elapsed)
                        if remaining > 0:
                            self.log(f"Throttle delay ({remaining:.0f}s)...")
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
