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
        select(Race)
        .where(
            Race.season_year == year,
            Race.id.in_(select(DriverStanding.race_id)),
        )
        .order_by(Race.round.desc())
        .limit(1)
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
        select(Race)
        .where(
            Race.season_year == year,
            Race.id.in_(select(ConstructorStanding.race_id)),
        )
        .order_by(Race.round.desc())
        .limit(1)
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

    today = datetime.date.today()

    # Subquery: last race per season
    last_rounds = (
        select(
            Race.season_year,
            func.max(Race.round).label("max_round"),
        )
        .group_by(Race.season_year)
        .subquery()
    )
    last_races = (
        db.execute(
            select(Race)
            .join(
                last_rounds,
                (Race.season_year == last_rounds.c.season_year)
                & (Race.round == last_rounds.c.max_round),
            )
            .order_by(Race.season_year.desc())
        )
        .scalars()
        .all()
    )

    # Filter out ongoing seasons
    completed_races = [r for r in last_races if not r.date or r.date <= today]
    race_ids = [r.id for r in completed_races]
    race_year_map = {r.id: r.season_year for r in completed_races}

    if not race_ids:
        return []

    # Bulk-fetch driver champions (position=1) at last races
    driver_standings = (
        db.execute(
            select(DriverStanding).where(
                DriverStanding.race_id.in_(race_ids),
                DriverStanding.position == 1,
            )
        )
        .scalars()
        .all()
    )
    ds_by_race = {ds.race_id: ds for ds in driver_standings}

    # Bulk-fetch constructor champions (position=1) at last races
    constructor_standings = (
        db.execute(
            select(ConstructorStanding).where(
                ConstructorStanding.race_id.in_(race_ids),
                ConstructorStanding.position == 1,
            )
        )
        .scalars()
        .all()
    )
    cs_by_race = {cs.race_id: cs for cs in constructor_standings}

    # Bulk-fetch all referenced drivers and constructors
    driver_ids = {ds.driver_id for ds in driver_standings}
    constructor_ids = {cs.constructor_id for cs in constructor_standings}

    driver_map = {}
    if driver_ids:
        drivers = db.execute(select(Driver).where(Driver.id.in_(driver_ids))).scalars().all()
        driver_map = {d.id: d for d in drivers}

    constructor_map = {}
    if constructor_ids:
        constructors = (
            db.execute(select(Constructor).where(Constructor.id.in_(constructor_ids)))
            .scalars()
            .all()
        )
        constructor_map = {c.id: c for c in constructors}

    # Build results
    champions = []
    for race in completed_races:
        ds = ds_by_race.get(race.id)
        if not ds:
            continue

        driver = driver_map.get(ds.driver_id)
        cs = cs_by_race.get(race.id)
        constructor = constructor_map.get(cs.constructor_id) if cs else None

        champions.append(
            {
                "year": race_year_map[race.id],
                "driver": {
                    "id": driver.id,
                    "ref": driver.ref,
                    "firstName": driver.first_name,
                    "lastName": driver.last_name,
                    "headshotUrl": (
                        f"/headshots/{driver.ref}.png" if driver.has_headshot else None
                    ),
                }
                if driver
                else None,
                "driverPoints": ds.points,
                "constructor": {
                    "id": constructor.id,
                    "ref": constructor.ref,
                    "name": constructor.name,
                    "color": constructor.color,
                }
                if constructor
                else None,
                "constructorPoints": cs.points if cs else None,
            }
        )

    return champions
