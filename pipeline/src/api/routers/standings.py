from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.db.database import get_db
from src.db.models import Constructor, DriverStanding, Race, RaceResult
from src.db.queries import (
    get_constructor_standings_for_season,
    get_driver_standings_for_season,
)

router = APIRouter()


@router.get("/seasons/{year}/standings/drivers")
def driver_standings(year: int, db: Session = Depends(get_db)):
    standings = get_driver_standings_for_season(db, year)

    # Build a map of driver_id -> constructor for the last race of the season
    constructor_map: dict[str, Constructor | None] = {}
    if standings:
        last_race_id = standings[0].race_id
        for s in standings:
            race_result = db.execute(
                select(RaceResult).where(
                    RaceResult.race_id == last_race_id,
                    RaceResult.driver_id == s.driver_id,
                )
            ).scalar_one_or_none()
            if race_result:
                constructor_map[s.driver_id] = db.get(Constructor, race_result.constructor_id)
            else:
                constructor_map[s.driver_id] = None

    return {
        "year": year,
        "standings": [
            {
                "position": s.position,
                "points": s.points,
                "wins": s.wins,
                "driver": {
                    "id": s.driver.id,
                    "ref": s.driver.ref,
                    "code": s.driver.code,
                    "firstName": s.driver.first_name,
                    "lastName": s.driver.last_name,
                    "nationality": s.driver.nationality,
                    "countryCode": s.driver.country_code,
                    "headshotUrl": (
                        f"/headshots/{s.driver.ref}.png"
                        if s.driver.has_headshot
                        else None
                    ),
                },
                "constructor": {
                    "id": c.id,
                    "ref": c.ref,
                    "name": c.name,
                    "color": c.color,
                }
                if (c := constructor_map.get(s.driver_id))
                else None,
            }
            for s in standings
        ],
    }


@router.get("/seasons/{year}/standings/constructors")
def constructor_standings(year: int, db: Session = Depends(get_db)):
    standings = get_constructor_standings_for_season(db, year)
    return {
        "year": year,
        "standings": [
            {
                "position": s.position,
                "points": s.points,
                "wins": s.wins,
                "constructor": {
                    "id": s.constructor.id,
                    "ref": s.constructor.ref,
                    "name": s.constructor.name,
                    "nationality": s.constructor.nationality,
                    "countryCode": s.constructor.country_code,
                    "color": s.constructor.color,
                },
            }
            for s in standings
        ],
    }


@router.get("/seasons/{year}/standings/progression")
def standings_progression(year: int, top: int = 10, db: Session = Depends(get_db)):
    """Round-by-round championship progression for the season."""
    races = (
        db.execute(select(Race).where(Race.season_year == year).order_by(Race.round))
        .scalars()
        .all()
    )
    if not races:
        return {"year": year, "rounds": [], "drivers": []}

    # Get final standings to determine top N drivers
    final_standings = get_driver_standings_for_season(db, year)
    top_driver_ids = [s.driver_id for s in final_standings[:top]]

    # Fetch driver info + constructor for display
    driver_info = {}
    for s in final_standings[:top]:
        driver = s.driver
        # Get constructor from last race result
        result = db.execute(
            select(RaceResult).where(
                RaceResult.race_id == races[-1].id,
                RaceResult.driver_id == driver.id,
            )
        ).scalar_one_or_none()
        constructor = db.get(Constructor, result.constructor_id) if result else None
        driver_info[driver.id] = {
            "ref": driver.ref,
            "code": driver.code,
            "firstName": driver.first_name,
            "lastName": driver.last_name,
            "color": (constructor.color if constructor else None),
        }

    # Build round-by-round points for each top driver
    rounds = []
    for race in races:
        standings = (
            db.execute(
                select(DriverStanding).where(
                    DriverStanding.race_id == race.id,
                    DriverStanding.driver_id.in_(top_driver_ids),
                )
            )
            .scalars()
            .all()
        )
        round_data: dict = {"round": race.round, "raceName": race.name}
        for s in standings:
            info = driver_info.get(s.driver_id)
            if info:
                round_data[info["ref"]] = s.points
        rounds.append(round_data)

    return {
        "year": year,
        "rounds": rounds,
        "drivers": [
            driver_info[did] for did in top_driver_ids if did in driver_info
        ],
    }
