"""Ingest pit stop data from Fast-F1 Ergast API (2012+ only)."""

from datetime import date

import pandas as pd
from fastf1.ergast import Ergast
from sqlalchemy import select

from src.db.models import PitStop, Race, Season
from src.ingestion.base import BaseIngestor, api_call, clean, is_interrupted


class PitStopIngestor(BaseIngestor):
    """Ingest pit stops (available from 2012 onwards)."""

    def ingest(self) -> None:
        self.log("Fetching pit stops (2012+)...")
        erg = Ergast()

        # Find races that already have pit stops — skip them
        existing = set(
            self.db.execute(select(PitStop.race_id).group_by(PitStop.race_id)).scalars().all()
        )

        today = date.today()
        seasons = (
            self.db.execute(select(Season).where(Season.year >= 2012).order_by(Season.year))
            .scalars()
            .all()
        )

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
                    self.log(f"{season.year} R{race.round}: fetching pit stops...")
                    response = api_call(
                        erg.get_pit_stops,
                        season=season.year,
                        round=race.round,
                        limit=100,
                    )
                    if not response.content:
                        continue

                    df = response.content[0]
                    if df.empty:
                        continue

                    for _, row in df.iterrows():
                        stop_num = int(row["stop"])
                        pit_id = f"{race.id}_PIT_{row['driverId']}_{stop_num}"

                        # Convert duration to milliseconds
                        duration = clean(row.get("duration"))
                        duration_ms = None
                        if duration is not None:
                            if isinstance(duration, pd.Timedelta):
                                duration_ms = int(duration.total_seconds() * 1000)
                            elif isinstance(duration, str):
                                try:
                                    parts = duration.split(":")
                                    if len(parts) == 2:
                                        mins, secs = parts
                                        duration_ms = int((int(mins) * 60 + float(secs)) * 1000)
                                    else:
                                        duration_ms = int(float(duration) * 1000)
                                except (ValueError, TypeError):
                                    pass

                        time_of_day = clean(row.get("time"))
                        pit_stop = PitStop(
                            id=pit_id,
                            race_id=race.id,
                            driver_id=row["driverId"],
                            stop_number=stop_num,
                            lap=int(row["lap"]),
                            time_of_day=str(time_of_day) if time_of_day is not None else None,
                            duration_ms=duration_ms,
                        )
                        self.db.merge(pit_stop)
                        total_records += 1

                    self.db.commit()
                    season_fetched += 1
                    total_fetched += 1
                except InterruptedError:
                    raise
                except Exception as e:
                    self.log(f"Pit stops {season.year} R{race.round}: ERROR - {e}")
                    self.db.rollback()
                    continue

            if is_interrupted():
                break
            if season_fetched > 0:
                self.log(f"Season {season.year}: {season_fetched} pit stop races ingested")

        self.log(
            f"Ingested {total_records} pit stops from {total_fetched} races ({total_skipped} skipped)"
        )
