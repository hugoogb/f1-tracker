"""Ingest pit stops from the f1db dataset (1994+, the earliest f1db records)."""

from sqlalchemy import select

from src.db.models import Driver, PitStop, Race
from src.ingestion import f1db
from src.ingestion.base import BaseIngestor
from src.ingestion.races import race_id


class PitStopIngestor(BaseIngestor):
    def ingest(self, year_range: tuple[int, int] | None = None) -> None:
        data = f1db.load()
        known_races = {r.id for r in self.db.execute(select(Race)).scalars()}
        known_drivers = {d.ref for d in self.db.execute(select(Driver)).scalars()}

        total = 0
        races_with_stops = 0
        for race in data.races_for(year_range):
            rid = race_id(int(race["year"]), int(race["round"]))
            if rid not in known_races:
                continue

            stops = race.get("pitStops") or []
            if not stops:
                continue

            for row in stops:
                if row.get("driverId") not in known_drivers:
                    continue
                stop_number = row.get("stop")
                if stop_number is None:
                    continue

                self.db.merge(
                    PitStop(
                        id=f"{rid}_P_{row['driverId']}_{stop_number}",
                        race_id=rid,
                        driver_id=row["driverId"],
                        stop_number=int(stop_number),
                        lap=int(row.get("lap") or 0),
                        duration_ms=row.get("timeMillis"),
                    )
                )
                total += 1

            races_with_stops += 1
            self.db.commit()

        self.log(f"Ingested {total} pit stops across {races_with_stops} races")
