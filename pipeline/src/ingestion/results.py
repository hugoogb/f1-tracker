"""Ingest race results, qualifying results, and sprint results from Fast-F1 Ergast API."""

import pandas as pd
from fastf1.ergast import Ergast
from sqlalchemy import func, select

from src.db.models import (
    QualifyingResult,
    Race,
    RaceResult,
    Season,
    SprintResult,
)
from src.ingestion.base import BaseIngestor, api_call, clean, is_interrupted


def _safe_int(val) -> int | None:
    val = clean(val)
    if val is None:
        return None
    try:
        return int(val)
    except (ValueError, TypeError):
        return None


def _safe_float(val) -> float:
    val = clean(val)
    if val is None:
        return 0.0
    try:
        return float(val)
    except (ValueError, TypeError):
        return 0.0


def _safe_str(val) -> str | None:
    val = clean(val)
    if val is None:
        return None
    s = str(val)
    return s if s else None


def _timedelta_to_str(val) -> str | None:
    val = clean(val)
    if val is None:
        return None
    if isinstance(val, pd.Timedelta):
        total_seconds = val.total_seconds()
        minutes = int(total_seconds // 60)
        seconds = total_seconds % 60
        return f"{minutes}:{seconds:06.3f}"
    return str(val) if val else None


class RaceResultIngestor(BaseIngestor):
    def ingest(self) -> None:
        self.log("Fetching race results...")
        erg = Ergast()

        # Find races that already have results — skip them
        existing = set(
            self.db.execute(
                select(RaceResult.race_id).group_by(RaceResult.race_id)
            ).scalars().all()
        )

        seasons = self.db.execute(
            select(Season).order_by(Season.year)
        ).scalars().all()

        races_fetched = 0
        races_skipped = 0
        records = 0
        for season in seasons:
            races = self.db.execute(
                select(Race)
                .where(Race.season_year == season.year)
                .order_by(Race.round)
            ).scalars().all()

            for race in races:
                if is_interrupted():
                    break
                if race.id in existing:
                    races_skipped += 1
                    continue

                try:
                    response = api_call(
                        erg.get_race_results,
                        season=season.year, round=race.round,
                    )
                    if not response.content:
                        continue

                    df = response.content[0]
                    for _, row in df.iterrows():
                        result_id = f"{race.id}_R_{row['driverId']}"
                        result = RaceResult(
                            id=result_id,
                            race_id=race.id,
                            driver_id=row["driverId"],
                            constructor_id=row["constructorId"],
                            number=_safe_int(row.get("number")),
                            grid=_safe_int(row.get("grid")),
                            position=_safe_int(row.get("position")),
                            position_text=_safe_str(row.get("positionText")),
                            points=_safe_float(row.get("points")),
                            laps=_safe_int(row.get("laps")),
                            time_text=_timedelta_to_str(row.get("totalRaceTime")),
                            time_millis=_safe_int(row.get("totalRaceTimeMillis")),
                            fastest_lap=_safe_int(row.get("fastestLapNumber")),
                            fastest_lap_time=_timedelta_to_str(
                                row.get("fastestLapTime")
                            ),
                            fastest_lap_speed=_safe_str(
                                row.get("fastestLapAvgSpeed")
                            ),
                            status_id=_safe_int(row.get("statusId")),
                        )
                        self.db.merge(result)
                        records += 1

                    self.db.commit()
                    races_fetched += 1
                except InterruptedError:
                    raise
                except Exception as e:
                    self.log(
                        f"Race results {season.year} R{race.round}: ERROR - {e}"
                    )
                    self.db.rollback()
                    continue

            if is_interrupted():
                break
            self.log(f"Season {season.year}: race results done ({races_fetched} races fetched, {races_skipped} skipped)")

        self.log(f"Ingested {records} race results from {races_fetched} races ({races_skipped} skipped)")


class QualifyingIngestor(BaseIngestor):
    """Ingest qualifying results (1994+ only)."""

    def ingest(self) -> None:
        self.log("Fetching qualifying results...")
        erg = Ergast()

        existing = set(
            self.db.execute(
                select(QualifyingResult.race_id).group_by(QualifyingResult.race_id)
            ).scalars().all()
        )

        seasons = self.db.execute(
            select(Season).where(Season.year >= 1994).order_by(Season.year)
        ).scalars().all()

        races_fetched = 0
        races_skipped = 0
        records = 0
        for season in seasons:
            races = self.db.execute(
                select(Race)
                .where(Race.season_year == season.year)
                .order_by(Race.round)
            ).scalars().all()

            for race in races:
                if is_interrupted():
                    break
                if race.id in existing:
                    races_skipped += 1
                    continue

                try:
                    response = api_call(
                        erg.get_qualifying_results,
                        season=season.year, round=race.round,
                    )
                    if not response.content:
                        continue

                    df = response.content[0]
                    if df.empty:
                        continue

                    for _, row in df.iterrows():
                        result_id = f"{race.id}_Q_{row['driverId']}"
                        result = QualifyingResult(
                            id=result_id,
                            race_id=race.id,
                            driver_id=row["driverId"],
                            constructor_id=row["constructorId"],
                            number=_safe_int(row.get("number")),
                            position=_safe_int(row.get("position")),
                            q1=_timedelta_to_str(row.get("Q1")),
                            q2=_timedelta_to_str(row.get("Q2")),
                            q3=_timedelta_to_str(row.get("Q3")),
                        )
                        self.db.merge(result)
                        records += 1

                    self.db.commit()
                    races_fetched += 1
                except InterruptedError:
                    raise
                except Exception as e:
                    self.log(
                        f"Qualifying {season.year} R{race.round}: ERROR - {e}"
                    )
                    self.db.rollback()
                    continue

            if is_interrupted():
                break
            self.log(f"Season {season.year}: qualifying done ({races_fetched} races fetched, {races_skipped} skipped)")

        self.log(f"Ingested {records} qualifying results from {races_fetched} races ({races_skipped} skipped)")


class SprintResultIngestor(BaseIngestor):
    """Ingest sprint results (2021+ only)."""

    def ingest(self) -> None:
        self.log("Fetching sprint results (2021+)...")
        erg = Ergast()

        existing = set(
            self.db.execute(
                select(SprintResult.race_id).group_by(SprintResult.race_id)
            ).scalars().all()
        )

        seasons = self.db.execute(
            select(Season).where(Season.year >= 2021).order_by(Season.year)
        ).scalars().all()

        races_fetched = 0
        races_skipped = 0
        records = 0
        for season in seasons:
            races = self.db.execute(
                select(Race)
                .where(Race.season_year == season.year)
                .order_by(Race.round)
            ).scalars().all()

            for race in races:
                if is_interrupted():
                    break
                if race.id in existing:
                    races_skipped += 1
                    continue

                try:
                    response = api_call(
                        erg.get_sprint_results,
                        season=season.year, round=race.round,
                    )
                    if not response.content:
                        continue

                    df = response.content[0]
                    if df.empty:
                        continue

                    for _, row in df.iterrows():
                        result_id = f"{race.id}_S_{row['driverId']}"
                        result = SprintResult(
                            id=result_id,
                            race_id=race.id,
                            driver_id=row["driverId"],
                            constructor_id=row["constructorId"],
                            number=_safe_int(row.get("number")),
                            grid=_safe_int(row.get("grid")),
                            position=_safe_int(row.get("position")),
                            position_text=_safe_str(row.get("positionText")),
                            points=_safe_float(row.get("points")),
                            laps=_safe_int(row.get("laps")),
                            time_text=_timedelta_to_str(row.get("totalRaceTime")),
                            status_id=_safe_int(row.get("statusId")),
                        )
                        self.db.merge(result)
                        records += 1

                    self.db.commit()
                    races_fetched += 1
                except InterruptedError:
                    raise
                except Exception as e:
                    self.log(
                        f"Sprint {season.year} R{race.round}: ERROR - {e}"
                    )
                    self.db.rollback()
                    continue

            if is_interrupted():
                break
            if races_fetched > 0 or races_skipped > 0:
                self.log(f"Season {season.year}: sprints done ({races_fetched} races fetched, {races_skipped} skipped)")

        self.log(f"Ingested {records} sprint results from {races_fetched} races ({races_skipped} skipped)")
