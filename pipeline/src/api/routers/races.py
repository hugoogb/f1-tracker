from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.db.database import get_db
from src.db.models import PitStop, QualifyingResult, Race, RaceResult, SprintResult

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
