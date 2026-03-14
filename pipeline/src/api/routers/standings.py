from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.db.database import get_db
from src.db.models import Constructor, Race, RaceResult
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
                },
                "constructor": {
                    "id": c.id,
                    "ref": c.ref,
                    "name": c.name,
                    "color": c.color,
                } if (c := constructor_map.get(s.driver_id)) else None,
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
                    "color": s.constructor.color,
                },
            }
            for s in standings
        ],
    }
