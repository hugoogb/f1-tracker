from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.db.database import get_db
from src.db.models import LapTime, PitStop, QualifyingResult, Race, RaceResult, SprintResult

router = APIRouter()


@router.get("/seasons/{year}/races/{round}")
def get_race(year: int, round: int, db: Session = Depends(get_db)):
    race = db.execute(
        select(Race).where(Race.season_year == year, Race.round == round)
    ).scalar_one_or_none()
    if not race:
        raise HTTPException(status_code=404, detail="Race not found")

    results = (
        db.execute(
            select(RaceResult).where(RaceResult.race_id == race.id).order_by(RaceResult.position)
        )
        .scalars()
        .all()
    )

    return {
        "id": race.id,
        "round": race.round,
        "name": race.name,
        "date": str(race.date) if race.date else None,
        "circuit": {
            "id": race.circuit.id,
            "ref": race.circuit.ref,
            "name": race.circuit.name,
            "location": race.circuit.location,
            "country": race.circuit.country,
            "countryCode": race.circuit.country_code,
        },
        "results": [
            {
                "position": r.position,
                "positionText": r.position_text,
                "grid": r.grid,
                "points": r.points,
                "laps": r.laps,
                "time": r.time_text,
                "fastestLapTime": r.fastest_lap_time,
                "status": r.status.description if r.status else None,
                "driver": {
                    "id": r.driver.id,
                    "ref": r.driver.ref,
                    "code": r.driver.code,
                    "firstName": r.driver.first_name,
                    "lastName": r.driver.last_name,
                    "headshotUrl": f"/headshots/{r.driver.ref}.png" if r.driver.has_headshot else None,
                },
                "constructor": {
                    "id": r.constructor.id,
                    "ref": r.constructor.ref,
                    "name": r.constructor.name,
                    "color": r.constructor.color,
                },
            }
            for r in results
        ],
    }


@router.get("/seasons/{year}/races/{round}/qualifying")
def get_qualifying(year: int, round: int, db: Session = Depends(get_db)):
    race = db.execute(
        select(Race).where(Race.season_year == year, Race.round == round)
    ).scalar_one_or_none()
    if not race:
        raise HTTPException(status_code=404, detail="Race not found")

    results = (
        db.execute(
            select(QualifyingResult)
            .where(QualifyingResult.race_id == race.id)
            .order_by(QualifyingResult.position)
        )
        .scalars()
        .all()
    )

    return {
        "raceId": race.id,
        "results": [
            {
                "position": r.position,
                "q1": r.q1,
                "q2": r.q2,
                "q3": r.q3,
                "driver": {
                    "id": r.driver.id,
                    "ref": r.driver.ref,
                    "code": r.driver.code,
                    "firstName": r.driver.first_name,
                    "lastName": r.driver.last_name,
                    "headshotUrl": f"/headshots/{r.driver.ref}.png" if r.driver.has_headshot else None,
                },
                "constructor": {
                    "id": r.constructor.id,
                    "ref": r.constructor.ref,
                    "name": r.constructor.name,
                    "color": r.constructor.color,
                },
            }
            for r in results
        ],
    }


@router.get("/seasons/{year}/races/{round}/sprint")
def get_sprint(year: int, round: int, db: Session = Depends(get_db)):
    race = db.execute(
        select(Race).where(Race.season_year == year, Race.round == round)
    ).scalar_one_or_none()
    if not race:
        raise HTTPException(status_code=404, detail="Race not found")

    results = (
        db.execute(
            select(SprintResult)
            .where(SprintResult.race_id == race.id)
            .order_by(SprintResult.position)
        )
        .scalars()
        .all()
    )

    return {
        "raceId": race.id,
        "results": [
            {
                "position": r.position,
                "positionText": r.position_text,
                "grid": r.grid,
                "points": r.points,
                "laps": r.laps,
                "time": r.time_text,
                "status": r.status.description if r.status else None,
                "driver": {
                    "id": r.driver.id,
                    "ref": r.driver.ref,
                    "code": r.driver.code,
                    "firstName": r.driver.first_name,
                    "lastName": r.driver.last_name,
                    "headshotUrl": f"/headshots/{r.driver.ref}.png" if r.driver.has_headshot else None,
                },
                "constructor": {
                    "id": r.constructor.id,
                    "ref": r.constructor.ref,
                    "name": r.constructor.name,
                    "color": r.constructor.color,
                },
            }
            for r in results
        ],
    }


@router.get("/seasons/{year}/races/{round}/pitstops")
def get_pitstops(year: int, round: int, db: Session = Depends(get_db)):
    race = db.execute(
        select(Race).where(Race.season_year == year, Race.round == round)
    ).scalar_one_or_none()
    if not race:
        raise HTTPException(status_code=404, detail="Race not found")

    stops = (
        db.execute(
            select(PitStop)
            .where(PitStop.race_id == race.id)
            .order_by(PitStop.lap, PitStop.stop_number)
        )
        .scalars()
        .all()
    )

    return {
        "raceId": race.id,
        "pitStops": [
            {
                "stopNumber": s.stop_number,
                "lap": s.lap,
                "timeOfDay": s.time_of_day,
                "duration": f"{s.duration_ms / 1000:.3f}" if s.duration_ms is not None else None,
                "driver": {
                    "id": s.driver.id,
                    "ref": s.driver.ref,
                    "code": s.driver.code,
                    "firstName": s.driver.first_name,
                    "lastName": s.driver.last_name,
                    "headshotUrl": f"/headshots/{s.driver.ref}.png" if s.driver.has_headshot else None,
                },
            }
            for s in stops
        ],
    }


@router.get("/seasons/{year}/races/{round}/laps")
def get_laps(year: int, round: int, db: Session = Depends(get_db)):
    race = db.execute(
        select(Race).where(Race.season_year == year, Race.round == round)
    ).scalar_one_or_none()
    if not race:
        raise HTTPException(status_code=404, detail="Race not found")

    laps = (
        db.execute(
            select(LapTime)
            .where(LapTime.race_id == race.id)
            .order_by(LapTime.driver_id, LapTime.lap_number)
        )
        .scalars()
        .all()
    )

    # Build constructor lookup from race results (LapTime has no constructor_id)
    results = (
        db.execute(
            select(RaceResult)
            .where(RaceResult.race_id == race.id)
            .order_by(RaceResult.position)
        )
        .scalars()
        .all()
    )
    driver_constructor = {r.driver_id: r.constructor for r in results}
    driver_position = {r.driver_id: r.position for r in results}

    # Group laps by driver
    by_driver: dict[str, list[LapTime]] = defaultdict(list)
    for lap in laps:
        by_driver[lap.driver_id].append(lap)

    # Sort drivers by finishing position
    driver_ids = sorted(
        by_driver.keys(),
        key=lambda did: driver_position.get(did) or 999,
    )

    drivers_data = []
    for driver_id in driver_ids:
        driver_laps = by_driver[driver_id]
        driver = driver_laps[0].driver
        constructor = driver_constructor.get(driver_id)

        drivers_data.append({
            "driver": {
                "id": driver.id,
                "ref": driver.ref,
                "code": driver.code,
                "firstName": driver.first_name,
                "lastName": driver.last_name,
                "headshotUrl": f"/headshots/{driver.ref}.png" if driver.has_headshot else None,
            },
            "constructor": {
                "ref": constructor.ref if constructor else None,
                "name": constructor.name if constructor else None,
                "color": constructor.color if constructor else None,
            },
            "laps": [
                {
                    "lapNumber": lap.lap_number,
                    "timeMs": lap.time_millis,
                    "sector1Ms": lap.sector1_ms,
                    "sector2Ms": lap.sector2_ms,
                    "sector3Ms": lap.sector3_ms,
                    "compound": lap.compound,
                    "stint": lap.stint,
                    "tyreLife": lap.tyre_life,
                }
                for lap in driver_laps
            ],
        })

    return {
        "raceId": race.id,
        "drivers": drivers_data,
    }
