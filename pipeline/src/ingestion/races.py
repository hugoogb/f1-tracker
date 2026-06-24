"""Ingest race schedule from Fast-F1 Ergast API."""

from datetime import date

import pandas as pd
from fastf1.ergast import Ergast
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
from src.ingestion.base import BaseIngestor, api_call, clean, is_interrupted

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


def _parse_date(val):
    val = clean(val)
    if val is None:
        return None
    if isinstance(val, str):
        return pd.to_datetime(val).date()
    if hasattr(val, "date"):
        return val.date()
    return None


def _parse_time(val):
    val = clean(val)
    if val is None:
        return None
    if isinstance(val, str) and val:
        try:
            return pd.to_datetime(val).time()
        except Exception:
            return None
    if hasattr(val, "time"):
        return val.time()
    return None


class RaceIngestor(BaseIngestor):
    def ingest(self, year_range: tuple[int, int] | None = None) -> None:
        self.log("Fetching race schedules...")
        erg = Ergast()
        today = date.today()

        query = select(Season).order_by(Season.year)
        if year_range:
            query = query.where(Season.year >= year_range[0], Season.year <= year_range[1])
        seasons = self.db.execute(query).scalars().all()

        total = 0
        for season in seasons:
            if is_interrupted():
                break

            existing = (
                self.db.execute(
                    select(Race).where(Race.season_year == season.year).order_by(Race.round)
                )
                .scalars()
                .all()
            )

            # Closed, fully-loaded seasons never change — skip them so the full
            # history isn't re-fetched (and rate-limited) on every run.
            if existing and self._is_closed(season.year, existing, today):
                continue

            try:
                self.log(f"Season {season.year}: fetching schedule...")
                schedule = api_call(erg.get_race_schedule, season=season.year, limit=50)
                canonical = self._parse_schedule(season.year, schedule)
                if not canonical:
                    self.log(f"Season {season.year}: no schedule yet")
                    continue

                removed = self._reconcile(season.year, existing, canonical)
                count = self._upsert(canonical)
                self.db.commit()

                total += count
                msg = f"Season {season.year}: {count} races"
                if removed:
                    msg += f" ({removed} cancelled race(s) removed)"
                self.log(msg)
            except InterruptedError:
                raise
            except Exception as e:
                self.log(f"Season {season.year}: ERROR - {e}")
                self.db.rollback()
                continue

        self.log(f"Ingested {total} races total")

    def _is_closed(self, year: int, existing: list[Race], today: date) -> bool:
        """A season is closed once it's a past year with every race already run.

        The current (or any future) year is always treated as open so its
        schedule keeps reconciling against the canonical source.
        """
        if year >= today.year:
            return False
        return all(r.date is not None and r.date < today for r in existing)

    def _parse_schedule(self, year: int, schedule: pd.DataFrame) -> list[dict]:
        """Normalize the Ergast schedule frame into canonical race dicts."""
        races = []
        for _, row in schedule.iterrows():
            rnd = int(row["round"])
            races.append(
                {
                    "id": f"{year}_{rnd:02d}",
                    "season_year": year,
                    "round": rnd,
                    "name": row["raceName"],
                    "circuit_id": row["circuitId"],
                    "date": _parse_date(row.get("raceDate")),
                    "time": _parse_time(row.get("raceTime")),
                    "url": clean(row.get("raceUrl")),
                }
            )
        return races

    def _reconcile(self, year: int, existing: list[Race], canonical: list[dict]) -> int:
        """Purge a season's data when the stored schedule diverges from canonical.

        Divergence means a stored round was cancelled or now maps to a different
        circuit (Ergast renumbers rounds when a race is dropped mid-season). When
        that happens, race_ids no longer line up with the source, so the whole
        season is purged and rebuilt — downstream ingestors then re-fetch results
        against the corrected rounds. Pure schedule *additions* don't diverge and
        are handled by the upsert without touching existing data.

        Returns the number of races removed (0 if no purge).
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

    def _upsert(self, canonical: list[dict]) -> int:
        """Insert/update each canonical race by its (year, round) id."""
        for c in canonical:
            self.db.merge(Race(**c))
        return len(canonical)
