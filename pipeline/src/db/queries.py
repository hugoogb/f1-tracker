from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.db.models import (
    Circuit,
    Constructor,
    ConstructorStanding,
    Driver,
    DriverStanding,
    QualifyingResult,
    Race,
    RaceResult,
    Season,
)


def get_all_seasons(db: Session) -> list[Season]:
    return db.execute(select(Season).order_by(Season.year.desc())).scalars().all()


def get_season_races(db: Session, year: int) -> list[Race]:
    return (
        db.execute(select(Race).where(Race.season_year == year).order_by(Race.round))
        .scalars()
        .all()
    )


def get_race_results(db: Session, race_id: str) -> list[RaceResult]:
    return (
        db.execute(
            select(RaceResult).where(RaceResult.race_id == race_id).order_by(RaceResult.position)
        )
        .scalars()
        .all()
    )


def get_driver_standings_for_season(db: Session, year: int) -> list[DriverStanding]:
    last_race = db.execute(
        select(Race).where(Race.season_year == year).order_by(Race.round.desc()).limit(1)
    ).scalar_one_or_none()
    if not last_race:
        return []
    return (
        db.execute(
            select(DriverStanding)
            .where(DriverStanding.race_id == last_race.id)
            .order_by(DriverStanding.position)
        )
        .scalars()
        .all()
    )


def get_constructor_standings_for_season(db: Session, year: int) -> list[ConstructorStanding]:
    last_race = db.execute(
        select(Race).where(Race.season_year == year).order_by(Race.round.desc()).limit(1)
    ).scalar_one_or_none()
    if not last_race:
        return []
    return (
        db.execute(
            select(ConstructorStanding)
            .where(ConstructorStanding.race_id == last_race.id)
            .order_by(ConstructorStanding.position)
        )
        .scalars()
        .all()
    )


def get_driver_by_ref(db: Session, ref: str) -> Driver | None:
    return db.execute(select(Driver).where(Driver.ref == ref)).scalar_one_or_none()


def get_constructor_by_ref(db: Session, ref: str) -> Constructor | None:
    return db.execute(select(Constructor).where(Constructor.ref == ref)).scalar_one_or_none()


def get_driver_career_stats(db: Session, driver_id: str) -> dict:
    total_races = db.execute(select(func.count()).where(RaceResult.driver_id == driver_id)).scalar()
    wins = db.execute(
        select(func.count()).where(RaceResult.driver_id == driver_id, RaceResult.position == 1)
    ).scalar()
    podiums = db.execute(
        select(func.count()).where(RaceResult.driver_id == driver_id, RaceResult.position <= 3)
    ).scalar()
    total_points = db.execute(
        select(func.sum(RaceResult.points)).where(RaceResult.driver_id == driver_id)
    ).scalar()
    poles = db.execute(
        select(func.count()).where(
            QualifyingResult.driver_id == driver_id, QualifyingResult.position == 1
        )
    ).scalar()
    fastest_laps = db.execute(
        select(func.count()).where(Race.fastest_lap_driver_id == driver_id)
    ).scalar()
    last_rounds = (
        select(Race.season_year, func.max(Race.round).label("max_round"))
        .group_by(Race.season_year)
        .subquery()
    )
    last_race_ids = select(Race.id).join(
        last_rounds,
        (Race.season_year == last_rounds.c.season_year) & (Race.round == last_rounds.c.max_round),
    )
    championships = db.execute(
        select(func.count()).where(
            DriverStanding.driver_id == driver_id,
            DriverStanding.position == 1,
            DriverStanding.race_id.in_(last_race_ids),
        )
    ).scalar()

    return {
        "total_races": total_races or 0,
        "wins": wins or 0,
        "podiums": podiums or 0,
        "poles": poles or 0,
        "fastest_laps": fastest_laps or 0,
        "championships": championships or 0,
        "total_points": float(total_points or 0),
    }


def search_drivers(db: Session, query: str, limit: int = 10) -> list[Driver]:
    pattern = f"%{query}%"
    return (
        db.execute(
            select(Driver)
            .where(
                (Driver.first_name.ilike(pattern))
                | (Driver.last_name.ilike(pattern))
                | (Driver.code.ilike(pattern))
                | (Driver.ref.ilike(pattern))
            )
            .limit(limit)
        )
        .scalars()
        .all()
    )


def search_constructors(db: Session, query: str, limit: int = 10) -> list[Constructor]:
    pattern = f"%{query}%"
    return (
        db.execute(
            select(Constructor)
            .where((Constructor.name.ilike(pattern)) | (Constructor.ref.ilike(pattern)))
            .limit(limit)
        )
        .scalars()
        .all()
    )


def search_circuits(db: Session, query: str, limit: int = 5) -> list[Circuit]:
    pattern = f"%{query}%"
    return (
        db.execute(
            select(Circuit)
            .where(
                (Circuit.name.ilike(pattern))
                | (Circuit.location.ilike(pattern))
                | (Circuit.country.ilike(pattern))
            )
            .limit(limit)
        )
        .scalars()
        .all()
    )


def get_constructor_career_stats(db: Session, constructor_id: str) -> dict:
    total_entries = db.execute(
        select(func.count(func.distinct(RaceResult.race_id))).where(
            RaceResult.constructor_id == constructor_id
        )
    ).scalar()
    wins = db.execute(
        select(func.count()).where(
            RaceResult.constructor_id == constructor_id, RaceResult.position == 1
        )
    ).scalar()
    podiums = db.execute(
        select(func.count()).where(
            RaceResult.constructor_id == constructor_id, RaceResult.position <= 3
        )
    ).scalar()
    total_points = db.execute(
        select(func.sum(RaceResult.points)).where(RaceResult.constructor_id == constructor_id)
    ).scalar()

    return {
        "total_entries": total_entries or 0,
        "wins": wins or 0,
        "podiums": podiums or 0,
        "total_points": float(total_points or 0),
    }


def get_season_champions(db: Session) -> list[dict]:
    import datetime

    seasons = db.execute(select(Season).order_by(Season.year.desc())).scalars().all()
    champions = []
    today = datetime.date.today()
    for season in seasons:
        last_race = db.execute(
            select(Race).where(Race.season_year == season.year).order_by(Race.round.desc()).limit(1)
        ).scalar_one_or_none()
        if not last_race:
            continue

        # Skip ongoing seasons where the last race hasn't happened yet
        if last_race.date and last_race.date > today:
            continue

        driver_champ = db.execute(
            select(DriverStanding).where(
                DriverStanding.race_id == last_race.id, DriverStanding.position == 1
            )
        ).scalar_one_or_none()

        constructor_champ = db.execute(
            select(ConstructorStanding).where(
                ConstructorStanding.race_id == last_race.id,
                ConstructorStanding.position == 1,
            )
        ).scalar_one_or_none()

        if not driver_champ:
            continue

        driver = db.get(Driver, driver_champ.driver_id)
        constructor = (
            db.get(Constructor, constructor_champ.constructor_id) if constructor_champ else None
        )

        champions.append(
            {
                "year": season.year,
                "driver": {
                    "id": driver.id,
                    "ref": driver.ref,
                    "firstName": driver.first_name,
                    "lastName": driver.last_name,
                    "headshotUrl": f"/headshots/{driver.ref}.png" if driver.has_headshot else None,
                }
                if driver
                else None,
                "driverPoints": driver_champ.points,
                "constructor": {
                    "id": constructor.id,
                    "ref": constructor.ref,
                    "name": constructor.name,
                    "color": constructor.color,
                }
                if constructor
                else None,
                "constructorPoints": constructor_champ.points if constructor_champ else None,
            }
        )

    return champions
