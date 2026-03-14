"""Ingest race schedule from Fast-F1 Ergast API."""

import pandas as pd
from fastf1.ergast import Ergast
from sqlalchemy import func, select

from src.db.models import Race, Season
from src.ingestion.base import BaseIngestor, api_call, clean, is_interrupted


class RaceIngestor(BaseIngestor):
    def ingest(self) -> None:
        count = self.db.scalar(select(func.count()).select_from(Race))
        if count and count > 0:
            self.log(f"Skipping — {count} races already loaded")
            return

        self.log("Fetching race schedules...")
        erg = Ergast()

        seasons = self.db.execute(
            select(Season).order_by(Season.year)
        ).scalars().all()

        total = 0
        for season in seasons:
            if is_interrupted():
                break
            try:
                schedule = api_call(
                    erg.get_race_schedule, season=season.year, limit=50
                )
                count = 0
                for _, row in schedule.iterrows():
                    race_date = clean(row.get("raceDate"))
                    if race_date is not None:
                        if isinstance(race_date, str):
                            race_date = pd.to_datetime(race_date).date()
                        elif hasattr(race_date, "date"):
                            race_date = race_date.date()

                    race_time = clean(row.get("raceTime"))
                    if race_time is not None:
                        if isinstance(race_time, str) and race_time:
                            try:
                                race_time = pd.to_datetime(race_time).time()
                            except Exception:
                                race_time = None
                        elif hasattr(race_time, "time"):
                            race_time = race_time.time()
                        else:
                            race_time = None

                    race_id = f"{season.year}_{int(row['round']):02d}"
                    race = Race(
                        id=race_id,
                        season_year=season.year,
                        round=int(row["round"]),
                        name=row["raceName"],
                        circuit_id=row["circuitId"],
                        date=race_date,
                        time=race_time,
                        url=clean(row.get("raceUrl")),
                    )
                    self.db.merge(race)
                    count += 1

                self.db.commit()
                total += count
                self.log(f"Season {season.year}: {count} races")
            except InterruptedError:
                raise
            except Exception as e:
                self.log(f"Season {season.year}: ERROR - {e}")
                self.db.rollback()
                continue

        self.log(f"Ingested {total} races total")
