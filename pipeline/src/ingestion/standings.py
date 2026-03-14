"""Ingest end-of-season driver and constructor standings from Fast-F1 Ergast API."""

from fastf1.ergast import Ergast
from sqlalchemy import select

from src.db.models import (
    ConstructorStanding,
    DriverStanding,
    Race,
    Season,
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


class StandingsIngestor(BaseIngestor):
    """Ingest end-of-season standings (last round only per season)."""

    def ingest(self) -> None:
        self.log("Fetching end-of-season standings...")
        erg = Ergast()

        # Find races that already have standings — skip them
        ds_existing = set(
            self.db.execute(select(DriverStanding.race_id).group_by(DriverStanding.race_id))
            .scalars()
            .all()
        )
        cs_existing = set(
            self.db.execute(
                select(ConstructorStanding.race_id).group_by(ConstructorStanding.race_id)
            )
            .scalars()
            .all()
        )

        seasons = self.db.execute(select(Season).order_by(Season.year)).scalars().all()

        driver_total = 0
        constructor_total = 0

        for season in seasons:
            if is_interrupted():
                break

            last_race = self.db.execute(
                select(Race)
                .where(Race.season_year == season.year)
                .order_by(Race.round.desc())
                .limit(1)
            ).scalar_one_or_none()

            if not last_race:
                continue

            # Driver standings
            if last_race.id not in ds_existing:
                try:
                    ds_response = api_call(erg.get_driver_standings, season=season.year)
                    if ds_response.content:
                        df = ds_response.content[0]
                        for _, row in df.iterrows():
                            standing_id = f"{last_race.id}_DS_{row['driverId']}"
                            standing = DriverStanding(
                                id=standing_id,
                                race_id=last_race.id,
                                driver_id=row["driverId"],
                                points=_safe_float(row.get("points")),
                                position=_safe_int(row.get("position")),
                                wins=_safe_int(row.get("wins")) or 0,
                            )
                            self.db.merge(standing)
                            driver_total += 1

                    self.db.commit()
                except InterruptedError:
                    raise
                except Exception as e:
                    self.log(f"Driver standings {season.year}: ERROR - {e}")
                    self.db.rollback()

            # Constructor standings
            if last_race.id not in cs_existing:
                try:
                    cs_response = api_call(erg.get_constructor_standings, season=season.year)
                    if cs_response.content:
                        df = cs_response.content[0]
                        for _, row in df.iterrows():
                            standing_id = f"{last_race.id}_CS_{row['constructorId']}"
                            standing = ConstructorStanding(
                                id=standing_id,
                                race_id=last_race.id,
                                constructor_id=row["constructorId"],
                                points=_safe_float(row.get("points")),
                                position=_safe_int(row.get("position")),
                                wins=_safe_int(row.get("wins")) or 0,
                            )
                            self.db.merge(standing)
                            constructor_total += 1

                    self.db.commit()
                except InterruptedError:
                    raise
                except Exception as e:
                    self.log(f"Constructor standings {season.year}: ERROR - {e}")
                    self.db.rollback()

            self.log(f"Season {season.year}: standings done")

        self.log(
            f"Ingested {driver_total} driver standings, {constructor_total} constructor standings"
        )
