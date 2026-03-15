from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.db.database import get_db
from src.db.models import DriverStanding, RaceResult
from src.db.queries import get_all_seasons, get_season_races

router = APIRouter()


@router.get("/seasons")
def list_seasons(db: Session = Depends(get_db)):
    seasons = get_all_seasons(db)
    return {"data": [{"year": s.year, "url": s.url} for s in seasons]}


@router.get("/seasons/{year}")
def get_season(year: int, db: Session = Depends(get_db)):
    races = get_season_races(db, year)
    return {
        "year": year,
        "races": [
            {
                "id": r.id,
                "round": r.round,
                "name": r.name,
                "date": str(r.date) if r.date else None,
                "circuit": {
                    "id": r.circuit.id,
                    "ref": r.circuit.ref,
                    "name": r.circuit.name,
                    "location": r.circuit.location,
                    "country": r.circuit.country,
                    "countryCode": r.circuit.country_code,
                },
            }
            for r in races
        ],
    }


@router.get("/seasons/{year}/heatmap")
def get_season_heatmap(year: int, db: Session = Depends(get_db)):
    races = get_season_races(db, year)
    if not races:
        raise HTTPException(status_code=404, detail="Season not found")

    race_ids = [r.id for r in races]
    race_round_map = {r.id: r.round for r in races}

    # Fetch all race results for the season in one query
    all_results = (
        db.execute(
            select(RaceResult)
            .where(RaceResult.race_id.in_(race_ids))
        )
        .scalars()
        .all()
    )

    # Get final standings to determine driver order
    last_race = races[-1]
    standings = (
        db.execute(
            select(DriverStanding)
            .where(DriverStanding.race_id == last_race.id)
            .order_by(DriverStanding.position)
        )
        .scalars()
        .all()
    )

    # Build driver order from standings
    driver_order = [s.driver_id for s in standings]

    # Build lookup: driver_id -> {round -> result}
    driver_results: dict[int, dict[int, RaceResult]] = defaultdict(dict)
    driver_constructor: dict[int, object] = {}
    for r in all_results:
        rnd = race_round_map[r.race_id]
        driver_results[r.driver_id][rnd] = r
        driver_constructor[r.driver_id] = r.constructor  # Last one wins

    # Include drivers not in standings (e.g., mid-season entries)
    for driver_id in driver_results:
        if driver_id not in driver_order:
            driver_order.append(driver_id)

    # Build response
    drivers_data = []
    for driver_id in driver_order:
        results_by_round = driver_results.get(driver_id, {})
        if not results_by_round:
            continue

        # Get driver info from any result
        sample_result = next(iter(results_by_round.values()))
        constructor = driver_constructor.get(driver_id)

        drivers_data.append({
            "driver": {
                "ref": sample_result.driver.ref,
                "code": sample_result.driver.code,
                "firstName": sample_result.driver.first_name,
                "lastName": sample_result.driver.last_name,
            },
            "constructor": {
                "ref": constructor.ref if constructor else None,
                "name": constructor.name if constructor else None,
                "color": constructor.color if constructor else None,
            },
            "results": [
                {
                    "round": rnd,
                    "position": r.position,
                    "positionText": r.position_text,
                    "points": r.points,
                    "status": r.status.description if r.status else None,
                }
                for rnd, r in sorted(results_by_round.items())
            ],
        })

    return {
        "year": year,
        "rounds": [
            {"round": r.round, "name": r.name}
            for r in races
        ],
        "drivers": drivers_data,
    }
