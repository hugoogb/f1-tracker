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

    fastest_lap_data = None
    if race.fastest_lap_driver:
        fastest_lap_data = {
            "lapNumber": race.fastest_lap_number,
            "time": race.fastest_lap_time,
            "speed": race.fastest_lap_speed,
            "driver": {
                "ref": race.fastest_lap_driver.ref,
                "code": race.fastest_lap_driver.code,
                "firstName": race.fastest_lap_driver.first_name,
                "lastName": race.fastest_lap_driver.last_name,
            },
            "constructor": {
                "ref": race.fastest_lap_constructor.ref,
                "name": race.fastest_lap_constructor.name,
                "color": race.fastest_lap_constructor.color,
            }
            if race.fastest_lap_constructor
            else None,
        }

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
        "fastestLap": fastest_lap_data,
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
                    "headshotUrl": (
                        f"/headshots/{r.driver.ref}.png" if r.driver.has_headshot else None
                    ),
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

    def _sector_data(driver, time_ms):
        if not driver or not time_ms:
            return None
        return {
            "timeMs": time_ms,
            "driver": {
                "ref": driver.ref,
                "code": driver.code,
                "firstName": driver.first_name,
                "lastName": driver.last_name,
            },
        }

    fastest_sectors = None
    if race.best_quali_s1_ms is not None:
        fastest_sectors = {
            "s1": _sector_data(race.best_quali_s1_driver, race.best_quali_s1_ms),
            "s2": _sector_data(race.best_quali_s2_driver, race.best_quali_s2_ms),
            "s3": _sector_data(race.best_quali_s3_driver, race.best_quali_s3_ms),
        }

    return {
        "raceId": race.id,
        "fastestSectors": fastest_sectors,
        "results": [
            {
                "position": r.position,
                "q1": r.q1,
                "q2": r.q2,
                "q3": r.q3,
                "sectors": {
                    "q1": {
                        "s1Ms": r.q1_s1_ms,
                        "s2Ms": r.q1_s2_ms,
                        "s3Ms": r.q1_s3_ms,
                    },
                    "q2": {
                        "s1Ms": r.q2_s1_ms,
                        "s2Ms": r.q2_s2_ms,
                        "s3Ms": r.q2_s3_ms,
                    },
                    "q3": {
                        "s1Ms": r.q3_s1_ms,
                        "s2Ms": r.q3_s2_ms,
                        "s3Ms": r.q3_s3_ms,
                    },
                }
                if r.q1_s1_ms is not None
                else None,
                "driver": {
                    "id": r.driver.id,
                    "ref": r.driver.ref,
                    "code": r.driver.code,
                    "firstName": r.driver.first_name,
                    "lastName": r.driver.last_name,
                    "headshotUrl": (
                        f"/headshots/{r.driver.ref}.png" if r.driver.has_headshot else None
                    ),
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
                    "headshotUrl": (
                        f"/headshots/{r.driver.ref}.png" if r.driver.has_headshot else None
                    ),
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
                    "headshotUrl": (
                        f"/headshots/{s.driver.ref}.png" if s.driver.has_headshot else None
                    ),
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
            select(RaceResult).where(RaceResult.race_id == race.id).order_by(RaceResult.position)
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

        drivers_data.append(
            {
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
            }
        )

    return {
        "raceId": race.id,
        "drivers": drivers_data,
    }


@router.get("/seasons/{year}/races/{round}/positions")
def get_positions(year: int, round: int, db: Session = Depends(get_db)):
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

    if not laps:
        return {"raceId": race.id, "totalLaps": 0, "drivers": []}

    # Get race results for grid positions and constructor info
    results = db.execute(select(RaceResult).where(RaceResult.race_id == race.id)).scalars().all()
    driver_grid = {r.driver_id: r.grid for r in results}
    driver_constructor = {r.driver_id: r.constructor for r in results}
    driver_final_pos = {r.driver_id: r.position for r in results}

    # Group laps by driver and compute cumulative times
    by_driver: dict[int, list[LapTime]] = defaultdict(list)
    for lap in laps:
        by_driver[lap.driver_id].append(lap)

    driver_cumulative: dict[int, dict[int, int]] = {}
    for driver_id, driver_laps in by_driver.items():
        cumulative = {}
        total = 0
        for lap in sorted(driver_laps, key=lambda lt: lt.lap_number):
            if lap.time_millis is None:
                break
            total += lap.time_millis
            cumulative[lap.lap_number] = total
        if cumulative:
            driver_cumulative[driver_id] = cumulative

    if not driver_cumulative:
        return {"raceId": race.id, "totalLaps": 0, "drivers": []}

    max_lap = max(max(cum.keys()) for cum in driver_cumulative.values())

    # For each lap, rank drivers by cumulative time
    positions_by_driver: dict[int, dict[int, int]] = defaultdict(dict)
    for lap_num in range(1, max_lap + 1):
        drivers_at_lap = []
        for driver_id, cum in driver_cumulative.items():
            if lap_num in cum:
                drivers_at_lap.append((driver_id, cum[lap_num]))
        drivers_at_lap.sort(key=lambda x: x[1])
        for pos, (driver_id, _) in enumerate(drivers_at_lap, 1):
            positions_by_driver[driver_id][lap_num] = pos

    # Add grid position as lap 0
    for driver_id in driver_cumulative:
        grid = driver_grid.get(driver_id)
        if grid:
            positions_by_driver[driver_id][0] = grid

    # Build response sorted by finishing position
    sorted_driver_ids = sorted(
        driver_cumulative.keys(),
        key=lambda d: driver_final_pos.get(d) or 999,
    )

    drivers_data = []
    for driver_id in sorted_driver_ids:
        driver_laps = by_driver[driver_id]
        driver = driver_laps[0].driver
        constructor = driver_constructor.get(driver_id)
        positions = positions_by_driver.get(driver_id, {})

        drivers_data.append(
            {
                "driver": {
                    "id": driver.id,
                    "ref": driver.ref,
                    "code": driver.code,
                    "firstName": driver.first_name,
                    "lastName": driver.last_name,
                },
                "constructor": {
                    "ref": constructor.ref if constructor else None,
                    "name": constructor.name if constructor else None,
                    "color": constructor.color if constructor else None,
                },
                "positions": [
                    {"lap": lap_num, "position": pos} for lap_num, pos in sorted(positions.items())
                ],
            }
        )

    return {
        "raceId": race.id,
        "totalLaps": max_lap,
        "drivers": drivers_data,
    }


@router.get("/seasons/{year}/races/{round}/pitstops/analysis")
def get_pitstops_analysis(year: int, round: int, db: Session = Depends(get_db)):
    race = db.execute(
        select(Race).where(Race.season_year == year, Race.round == round)
    ).scalar_one_or_none()
    if not race:
        raise HTTPException(status_code=404, detail="Race not found")

    stops = (
        db.execute(select(PitStop).where(PitStop.race_id == race.id).order_by(PitStop.duration_ms))
        .scalars()
        .all()
    )

    if not stops:
        return {
            "raceId": race.id,
            "totalStops": 0,
            "avgDuration": None,
            "fastestStop": None,
            "teamAverages": [],
            "distribution": [],
        }

    # Build driver -> constructor map from race results
    results = db.execute(select(RaceResult).where(RaceResult.race_id == race.id)).scalars().all()
    driver_constructor = {r.driver_id: r.constructor for r in results}

    # Filter stops with valid duration
    valid_stops = [s for s in stops if s.duration_ms is not None]
    if not valid_stops:
        return {
            "raceId": race.id,
            "totalStops": len(stops),
            "avgDuration": None,
            "fastestStop": None,
            "teamAverages": [],
            "distribution": [],
        }

    # Fastest stop
    fastest = valid_stops[0]  # Already sorted by duration_ms
    fastest_constructor = driver_constructor.get(fastest.driver_id)

    # Average duration
    total_duration = sum(s.duration_ms for s in valid_stops)
    avg_duration = total_duration / len(valid_stops)

    # Team averages
    team_totals: dict[int, dict] = {}
    for s in valid_stops:
        constructor = driver_constructor.get(s.driver_id)
        if not constructor:
            continue
        if constructor.id not in team_totals:
            team_totals[constructor.id] = {
                "constructor": constructor,
                "total_ms": 0,
                "count": 0,
            }
        team_totals[constructor.id]["total_ms"] += s.duration_ms
        team_totals[constructor.id]["count"] += 1

    team_averages = sorted(
        [
            {
                "constructor": {
                    "ref": t["constructor"].ref,
                    "name": t["constructor"].name,
                    "color": t["constructor"].color,
                },
                "avgDuration": f"{t['total_ms'] / t['count'] / 1000:.3f}",
                "stopCount": t["count"],
            }
            for t in team_totals.values()
        ],
        key=lambda x: float(x["avgDuration"]),
    )

    # Distribution buckets
    buckets = [
        ("<2.0s", 0, 2000),
        ("2.0-2.5s", 2000, 2500),
        ("2.5-3.0s", 2500, 3000),
        ("3.0-4.0s", 3000, 4000),
        ("4.0-5.0s", 4000, 5000),
        ("5.0s+", 5000, float("inf")),
    ]
    distribution = []
    for label, low, high in buckets:
        count = sum(1 for s in valid_stops if low <= s.duration_ms < high)
        if count > 0:
            distribution.append({"range": label, "count": count})

    return {
        "raceId": race.id,
        "totalStops": len(stops),
        "avgDuration": f"{avg_duration / 1000:.3f}",
        "fastestStop": {
            "driver": {
                "ref": fastest.driver.ref,
                "code": fastest.driver.code,
                "firstName": fastest.driver.first_name,
                "lastName": fastest.driver.last_name,
            },
            "constructor": {
                "ref": fastest_constructor.ref,
                "name": fastest_constructor.name,
                "color": fastest_constructor.color,
            }
            if fastest_constructor
            else None,
            "lap": fastest.lap,
            "duration": f"{fastest.duration_ms / 1000:.3f}",
            "stopNumber": fastest.stop_number,
        },
        "teamAverages": team_averages,
        "distribution": distribution,
    }
