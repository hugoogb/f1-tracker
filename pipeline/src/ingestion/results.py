"""Ingest race results, qualifying results, and sprint results from Fast-F1 Ergast API."""

from datetime import date

import pandas as pd
from fastf1.ergast import Ergast
from sqlalchemy import select

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
    def ingest(self, year_range: tuple[int, int] | None = None) -> None:
        self.log("Fetching race results...")
        erg = Ergast()

        # Find races that already have results — skip them
        existing = set(
            self.db.execute(select(RaceResult.race_id).group_by(RaceResult.race_id)).scalars().all()
        )

        today = date.today()
        query = select(Season).order_by(Season.year)
        if year_range:
            query = query.where(Season.year >= year_range[0], Season.year <= year_range[1])
        seasons = self.db.execute(query).scalars().all()

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
                    self.log(f"{season.year} R{race.round}: fetching race results...")
                    response = api_call(
                        erg.get_race_results,
                        season=season.year,
                        round=race.round,
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
                            fastest_lap_time=_timedelta_to_str(row.get("fastestLapTime")),
                            fastest_lap_speed=_safe_str(row.get("fastestLapAvgSpeed")),
                            status_id=_safe_int(row.get("statusId")),
                        )
                        self.db.merge(result)
                        total_records += 1

                    self.db.commit()
                    season_fetched += 1
                    total_fetched += 1
                except InterruptedError:
                    raise
                except Exception as e:
                    self.log(f"Race results {season.year} R{race.round}: ERROR - {e}")
                    self.db.rollback()
                    continue

            if is_interrupted():
                break
            if season_fetched > 0:
                self.log(f"Season {season.year}: {season_fetched} races ingested")

        self.log(
            f"Ingested {total_records} race results from {total_fetched} races ({total_skipped} skipped)"
        )


class QualifyingIngestor(BaseIngestor):
    """Ingest qualifying results (1994+ only)."""

    def ingest(self, year_range: tuple[int, int] | None = None) -> None:
        self.log("Fetching qualifying results...")
        erg = Ergast()

        existing = set(
            self.db.execute(select(QualifyingResult.race_id).group_by(QualifyingResult.race_id))
            .scalars()
            .all()
        )

        today = date.today()
        min_year = max(1994, year_range[0]) if year_range else 1994
        query = select(Season).where(Season.year >= min_year).order_by(Season.year)
        if year_range:
            query = query.where(Season.year <= year_range[1])
        seasons = self.db.execute(query).scalars().all()

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
                    self.log(f"{season.year} R{race.round}: fetching qualifying...")
                    response = api_call(
                        erg.get_qualifying_results,
                        season=season.year,
                        round=race.round,
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
                        total_records += 1

                    self.db.commit()
                    season_fetched += 1
                    total_fetched += 1
                except InterruptedError:
                    raise
                except Exception as e:
                    self.log(f"Qualifying {season.year} R{race.round}: ERROR - {e}")
                    self.db.rollback()
                    continue

            if is_interrupted():
                break
            if season_fetched > 0:
                self.log(f"Season {season.year}: {season_fetched} qualifying ingested")

        self.log(
            f"Ingested {total_records} qualifying results from {total_fetched} races ({total_skipped} skipped)"
        )


class SprintResultIngestor(BaseIngestor):
    """Ingest sprint results (2021+ only)."""

    def ingest(self, year_range: tuple[int, int] | None = None) -> None:
        self.log("Fetching sprint results (2021+)...")
        erg = Ergast()

        existing = set(
            self.db.execute(select(SprintResult.race_id).group_by(SprintResult.race_id))
            .scalars()
            .all()
        )

        today = date.today()

        # Past seasons with sprint data are fully processed — skip them entirely.
        # (Most races don't have sprints, so they'll never be in `existing`;
        # this avoids re-checking ~16 non-sprint races per season every run.)
        past_sprint_seasons = set(
            self.db.execute(
                select(Race.season_year)
                .join(SprintResult, SprintResult.race_id == Race.id)
                .where(Race.season_year < today.year)
                .group_by(Race.season_year)
            )
            .scalars()
            .all()
        )

        min_year = max(2021, year_range[0]) if year_range else 2021
        query = select(Season).where(Season.year >= min_year).order_by(Season.year)
        if year_range:
            query = query.where(Season.year <= year_range[1])
        seasons = self.db.execute(query).scalars().all()

        total_fetched = 0
        total_skipped = 0
        total_records = 0
        for season in seasons:
            if season.year in past_sprint_seasons:
                continue

            races = (
                self.db.execute(
                    select(Race).where(Race.season_year == season.year).order_by(Race.round)
                )
                .scalars()
                .all()
            )

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
                    self.log(f"{season.year} R{race.round}: fetching sprint...")
                    response = api_call(
                        erg.get_sprint_results,
                        season=season.year,
                        round=race.round,
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
                        total_records += 1

                    self.db.commit()
                    season_fetched += 1
                    total_fetched += 1
                except InterruptedError:
                    raise
                except Exception as e:
                    self.log(f"Sprint {season.year} R{race.round}: ERROR - {e}")
                    self.db.rollback()
                    continue

            if is_interrupted():
                break
            if season_fetched > 0:
                self.log(f"Season {season.year}: {season_fetched} sprints ingested")

        self.log(
            f"Ingested {total_records} sprint results from {total_fetched} races ({total_skipped} skipped)"
        )
