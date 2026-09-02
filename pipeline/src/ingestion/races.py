"""Ingest the race schedule from the f1db dataset."""

from datetime import date, time

from sqlalchemy import delete, select

from src.db.models import (
    ConstructorStanding,
    DriverStanding,
    LapTime,
    PitStop,
    QualifyingResult,
    Race,
    RaceResult,
    Season,
    SprintResult,
)
from src.ingestion import f1db
from src.ingestion.base import BaseIngestor

# Child tables keyed by race_id, in FK-safe delete order (children before races).
_RACE_CHILD_TABLES = (
    LapTime,
    PitStop,
    SprintResult,
    QualifyingResult,
    RaceResult,
    DriverStanding,
    ConstructorStanding,
)


def race_id(year: int, round_number: int) -> str:
    """Stable race primary key, shared with the Fast-F1 ingestors."""
    return f"{year}_{round_number:02d}"


def _parse_date(value) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(str(value))
    except ValueError:
        return None


def _parse_time(value) -> time | None:
    """Parse an f1db start time ("15:00" or "15:00:00"), tolerating a Z suffix."""
    if not value:
        return None
    try:
        return time.fromisoformat(str(value).replace("Z", ""))
    except ValueError:
        return None


class RaceIngestor(BaseIngestor):
    def ingest(self, year_range: tuple[int, int] | None = None) -> None:
        data = f1db.load()
        races = data.races_for(year_range)
        self.log(f"Ingesting {len(races)} races...")

        known_years = {s.year for s in self.db.execute(select(Season)).scalars()}
        canonical_by_year: dict[int, list[dict]] = {}

        for race in races:
            year = int(race["year"])
            if year not in known_years:
                continue
            round_number = int(race["round"])
            canonical_by_year.setdefault(year, []).append(
                {
                    "id": race_id(year, round_number),
                    "season_year": year,
                    "round": round_number,
                    "name": data.grand_prix_name(race.get("grandPrixId"))
                    or race.get("officialName")
                    or f"Round {round_number}",
                    "circuit_id": race["circuitId"],
                    "date": _parse_date(race.get("date")),
                    "time": _parse_time(race.get("time")),
                }
            )

        total = 0
        for year, canonical in sorted(canonical_by_year.items()):
            existing = list(self.db.execute(select(Race).where(Race.season_year == year)).scalars())
            removed = self._reconcile(year, existing, canonical)
            for entry in canonical:
                self.db.merge(Race(**entry))
            self.db.commit()

            total += len(canonical)
            msg = f"Season {year}: {len(canonical)} races"
            if removed:
                msg += f" ({removed} stale race(s) removed)"
            self.log(msg)

        self.log(f"Ingested {total} races total")

    def _reconcile(self, year: int, existing: list[Race], canonical: list[dict]) -> int:
        """Purge a season when the stored schedule diverges from the source.

        Divergence means a stored round vanished or now maps to a different
        circuit. Race ids then no longer line up with the source, so the season
        is rebuilt from scratch. Pure additions are handled by the upsert.
        """
        if not existing:
            return 0

        db_map = {r.round: r.circuit_id for r in existing}
        can_map = {c["round"]: c["circuit_id"] for c in canonical}

        diverged = any(rnd not in can_map or can_map[rnd] != circ for rnd, circ in db_map.items())
        if not diverged:
            return 0

        self._purge_season(year)
        return len(existing)

    def _purge_season(self, year: int) -> None:
        """Delete a season's races and all race-keyed child rows (FK-safe order)."""
        race_ids = select(Race.id).where(Race.season_year == year)
        for table in _RACE_CHILD_TABLES:
            self.db.execute(delete(table).where(table.race_id.in_(race_ids)))
        self.db.execute(delete(Race).where(Race.season_year == year))
