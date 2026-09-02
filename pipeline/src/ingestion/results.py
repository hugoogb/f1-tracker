"""Ingest race, qualifying, and sprint results from the f1db dataset."""

from sqlalchemy import select

from src.db.models import (
    Constructor,
    Driver,
    QualifyingResult,
    Race,
    RaceResult,
    SprintResult,
    Status,
)
from src.ingestion import f1db
from src.ingestion.base import BaseIngestor
from src.ingestion.races import race_id


def average_speed_kph(course_length_km: float | None, lap_millis: int | None) -> str | None:
    """Average speed over one lap, as Ergast reported it: distance / time.

    f1db carries no speed field, but it does carry the circuit's course length
    and the lap time, which is exactly how the figure is defined.
    """
    if not course_length_km or not lap_millis:
        return None
    hours = lap_millis / 3_600_000
    if hours <= 0:
        return None
    return f"{course_length_km / hours:.3f}"


class _ResultIngestorBase(BaseIngestor):
    """Shared entity lookups and per-race iteration for the result ingestors."""

    def _context(self, year_range: tuple[int, int] | None):
        data = f1db.load()
        known_races = {r.id for r in self.db.execute(select(Race)).scalars()}
        known_drivers = {d.ref for d in self.db.execute(select(Driver)).scalars()}
        known_constructors = {c.ref for c in self.db.execute(select(Constructor)).scalars()}
        return data, data.races_for(year_range), known_races, known_drivers, known_constructors

    @staticmethod
    def _entities_present(row, known_drivers, known_constructors) -> bool:
        return row.get("driverId") in known_drivers and (
            row.get("constructorId") in known_constructors
        )


class RaceResultIngestor(_ResultIngestorBase):
    def ingest(self, year_range: tuple[int, int] | None = None) -> None:
        data, races, known_races, known_drivers, known_constructors = self._context(year_range)

        status_ids = {s.description: s.id for s in self.db.execute(select(Status)).scalars()}
        finished_id = status_ids.get("Finished")

        total = 0
        for race in races:
            rid = race_id(int(race["year"]), int(race["round"]))
            if rid not in known_races:
                continue

            course_length = race.get("courseLength")
            # Fastest lap details live in their own collection, keyed by driver.
            fastest = {
                fl["driverId"]: fl for fl in (race.get("fastestLaps") or []) if fl.get("driverId")
            }

            for row in race.get("raceResults") or []:
                if not self._entities_present(row, known_drivers, known_constructors):
                    continue

                reason = (row.get("reasonRetired") or "").strip()
                lap = fastest.get(row["driverId"])

                self.db.merge(
                    RaceResult(
                        id=f"{rid}_R_{row['driverId']}",
                        race_id=rid,
                        driver_id=row["driverId"],
                        constructor_id=row["constructorId"],
                        number=_as_int(row.get("driverNumber")),
                        grid=row.get("gridPositionNumber"),
                        position=row.get("positionNumber"),
                        position_text=row.get("positionText"),
                        points=float(row.get("points") or 0),
                        laps=row.get("laps"),
                        time_text=row.get("time"),
                        time_millis=row.get("timeMillis"),
                        fastest_lap=lap.get("lap") if lap else None,
                        fastest_lap_time=lap.get("time") if lap else None,
                        fastest_lap_speed=average_speed_kph(
                            course_length, lap.get("timeMillis") if lap else None
                        ),
                        status_id=status_ids.get(reason, finished_id) if reason else finished_id,
                    )
                )
                total += 1

            self.db.commit()

        self.log(f"Ingested {total} race results")


class QualifyingIngestor(_ResultIngestorBase):
    def ingest(self, year_range: tuple[int, int] | None = None) -> None:
        _, races, known_races, known_drivers, known_constructors = self._context(year_range)

        total = 0
        for race in races:
            rid = race_id(int(race["year"]), int(race["round"]))
            if rid not in known_races:
                continue

            for row in race.get("qualifyingResults") or []:
                if not self._entities_present(row, known_drivers, known_constructors):
                    continue

                # Pre-knockout eras have a single time rather than Q1/Q2/Q3.
                q1 = row.get("q1") or (row.get("time") if not row.get("q3") else None)

                self.db.merge(
                    QualifyingResult(
                        id=f"{rid}_Q_{row['driverId']}",
                        race_id=rid,
                        driver_id=row["driverId"],
                        constructor_id=row["constructorId"],
                        number=_as_int(row.get("driverNumber")),
                        position=row.get("positionNumber"),
                        q1=q1,
                        q2=row.get("q2"),
                        q3=row.get("q3"),
                    )
                )
                total += 1

            self.db.commit()

        self.log(f"Ingested {total} qualifying results")


class SprintResultIngestor(_ResultIngestorBase):
    def ingest(self, year_range: tuple[int, int] | None = None) -> None:
        _, races, known_races, known_drivers, known_constructors = self._context(year_range)

        status_ids = {s.description: s.id for s in self.db.execute(select(Status)).scalars()}
        finished_id = status_ids.get("Finished")

        total = 0
        for race in races:
            rid = race_id(int(race["year"]), int(race["round"]))
            if rid not in known_races:
                continue

            rows = race.get("sprintRaceResults") or []
            if not rows:
                continue

            for row in rows:
                if not self._entities_present(row, known_drivers, known_constructors):
                    continue

                reason = (row.get("reasonRetired") or "").strip()

                self.db.merge(
                    SprintResult(
                        id=f"{rid}_S_{row['driverId']}",
                        race_id=rid,
                        driver_id=row["driverId"],
                        constructor_id=row["constructorId"],
                        number=_as_int(row.get("driverNumber")),
                        grid=row.get("gridPositionNumber"),
                        position=row.get("positionNumber"),
                        position_text=row.get("positionText"),
                        points=float(row.get("points") or 0),
                        laps=row.get("laps"),
                        time_text=row.get("time"),
                        status_id=status_ids.get(reason, finished_id) if reason else finished_id,
                    )
                )
                total += 1

            self.db.commit()

        self.log(f"Ingested {total} sprint results")


def _as_int(value) -> int | None:
    """f1db serialises car numbers as strings ('1', '44')."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
