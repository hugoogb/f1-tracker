from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.api.serializers import constructor_compact, driver_summary, race_timing
from src.api.teammates import Entry, teammate_battles
from src.db.database import get_db
from src.db.models import (
    Constructor,
    Driver,
    DriverStanding,
    QualifyingResult,
    Race,
    RaceResult,
)
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
                **race_timing(r),
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
        db.execute(select(RaceResult).where(RaceResult.race_id.in_(race_ids))).scalars().all()
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

        drivers_data.append(
            {
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
            }
        )

    return {
        "year": year,
        "rounds": [{"round": r.round, "name": r.name} for r in races],
        "drivers": drivers_data,
    }


@router.get("/seasons/{year}/teammates")
def get_teammate_battles(year: int, db: Session = Depends(get_db)):
    """Intra-team head-to-head for every constructor that fielded a pair."""
    rows = db.execute(
        select(
            RaceResult.race_id,
            RaceResult.constructor_id,
            RaceResult.driver_id,
            RaceResult.position,
            RaceResult.position_text,
            RaceResult.points,
            QualifyingResult.position.label("quali_position"),
        )
        .join(Race, Race.id == RaceResult.race_id)
        .outerjoin(
            QualifyingResult,
            (QualifyingResult.race_id == RaceResult.race_id)
            & (QualifyingResult.driver_id == RaceResult.driver_id),
        )
        .where(Race.season_year == year)
    ).all()

    if not rows:
        return {"year": year, "teams": []}

    battles = teammate_battles(
        [
            Entry(
                race_id=row.race_id,
                constructor_id=row.constructor_id,
                driver_id=row.driver_id,
                position=row.position,
                position_text=row.position_text,
                points=float(row.points or 0),
                quali_position=row.quali_position,
            )
            for row in rows
        ]
    )

    driver_ids = {r.driver_id for r in rows}
    constructor_ids = set(battles)
    drivers = {
        d.id: d for d in db.execute(select(Driver).where(Driver.id.in_(driver_ids))).scalars().all()
    }
    constructors = {
        c.id: c
        for c in db.execute(select(Constructor).where(Constructor.id.in_(constructor_ids)))
        .scalars()
        .all()
    }

    teams = []
    for constructor_id, pairings in battles.items():
        constructor = constructors.get(constructor_id)
        if not constructor:
            continue
        expanded = []
        for pairing in pairings:
            driver_a = drivers.get(pairing["driverAId"])
            driver_b = drivers.get(pairing["driverBId"])
            if not driver_a or not driver_b:
                continue
            expanded.append(
                {
                    "sharedRaces": pairing["sharedRaces"],
                    "race": pairing["race"],
                    "qualifying": pairing["qualifying"],
                    "a": {
                        "driver": driver_summary(driver_a),
                        "points": pairing["pointsA"],
                        "bestFinish": pairing["bestFinishA"],
                    },
                    "b": {
                        "driver": driver_summary(driver_b),
                        "points": pairing["pointsB"],
                        "bestFinish": pairing["bestFinishB"],
                    },
                }
            )
        if expanded:
            teams.append(
                {
                    "constructor": constructor_compact(constructor),
                    "pairings": expanded,
                }
            )

    # Most-raced teams first: a full-season line-up before a one-off entry.
    teams.sort(key=lambda t: -max(p["sharedRaces"] for p in t["pairings"]))
    return {"year": year, "teams": teams}
