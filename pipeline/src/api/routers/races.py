import statistics
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.api.serializers import constructor_compact, driver_summary, race_schedule
from src.db.database import get_db
from src.db.models import Driver, LapTime, PitStop, QualifyingResult, Race, RaceResult, SprintResult

router = APIRouter()


def _seconds(milliseconds: float) -> str:
    """Milliseconds as a fixed-3dp second string, the unit the API speaks in."""
    return f"{milliseconds / 1000:.3f}"


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
        "schedule": race_schedule(race),
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
                "driver": driver_summary(r.driver),
                "constructor": constructor_compact(r.constructor),
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
                "driver": driver_summary(r.driver),
                "constructor": constructor_compact(r.constructor),
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
                "driver": driver_summary(r.driver),
                "constructor": constructor_compact(r.constructor),
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

    # Durations are pit lane times, so the useful comparison within one race is
    # against its quickest stop rather than against an absolute target — see
    # the analysis endpoint below.
    durations = [s.duration_ms for s in stops if s.duration_ms is not None]
    benchmark_ms = min(durations) if durations else None

    results = db.execute(select(RaceResult).where(RaceResult.race_id == race.id)).scalars().all()
    driver_constructor = {r.driver_id: r.constructor for r in results}

    return {
        "raceId": race.id,
        "benchmark": _seconds(benchmark_ms) if benchmark_ms is not None else None,
        "pitStops": [
            {
                "stopNumber": s.stop_number,
                "lap": s.lap,
                "duration": _seconds(s.duration_ms) if s.duration_ms is not None else None,
                "timeLost": (
                    _seconds(s.duration_ms - benchmark_ms)
                    if s.duration_ms is not None and benchmark_ms is not None
                    else None
                ),
                "driver": {
                    "id": s.driver.id,
                    "ref": s.driver.ref,
                    "code": s.driver.code,
                    "firstName": s.driver.first_name,
                    "lastName": s.driver.last_name,
                },
                "constructor": (
                    constructor_compact(driver_constructor[s.driver_id])
                    if s.driver_id in driver_constructor
                    else None
                ),
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
                "driver": driver_summary(driver),
                "constructor": constructor_compact(constructor) if constructor else {},
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

    # Get race results for grid positions, constructor info, and final position
    results = db.execute(select(RaceResult).where(RaceResult.race_id == race.id)).scalars().all()
    if not results:
        return {"raceId": race.id, "totalLaps": 0, "coveredLaps": 0, "drivers": []}

    # The race's real distance, from f1db rather than from the timing data, so
    # the chart's axis spans the whole race even where the reconstruction below
    # runs out early.
    race_laps = max((r.laps or 0) for r in results)

    lt = LapTime.__table__

    # Fast-F1 reports a position per lap, and where it has been stored that is
    # simply the answer.
    stored = db.execute(
        select(lt.c.driver_id, lt.c.lap_number, lt.c.position).where(
            lt.c.race_id == race.id, lt.c.position.isnot(None)
        )
    ).all()
    if stored:
        return _positions_response(db, race, results, race_laps, stored)

    # Otherwise fall back to reconstructing them: rank drivers each lap by
    # elapsed race time. Races ingested before the position was stored have only
    # lap times, and re-fetching a session costs ~45s, so this stays.
    #
    # Fast-F1 leaves LapTime empty more often than it leaves the sectors empty,
    # so the sum of the three stands in when it does. That matters: a cumulative
    # total needs an unbroken chain from lap 1, so a single gap ends the driver's
    # line there — without this fallback one missing lap early on could cut the
    # whole field off within the first handful of laps.
    lap_ms = func.coalesce(
        lt.c.time_millis,
        lt.c.sector1_ms + lt.c.sector2_ms + lt.c.sector3_ms,
    )

    # Step 1: the last lap each driver has an unbroken chain of times up to
    max_valid_lap = (
        select(
            lt.c.driver_id,
            func.coalesce(
                func.min(lt.c.lap_number).filter(lap_ms.is_(None)) - 1,
                func.max(lt.c.lap_number),
            ).label("max_valid"),
        )
        .where(lt.c.race_id == race.id)
        .group_by(lt.c.driver_id)
        .subquery()
    )

    # Step 2: Cumulative times via window function
    cumulative_cte = (
        select(
            lt.c.driver_id,
            lt.c.lap_number,
            func.sum(lap_ms)
            .over(partition_by=lt.c.driver_id, order_by=lt.c.lap_number)
            .label("cumulative_ms"),
        )
        .where(
            lt.c.race_id == race.id,
            lap_ms.isnot(None),
            lt.c.lap_number
            <= select(max_valid_lap.c.max_valid)
            .where(max_valid_lap.c.driver_id == lt.c.driver_id)
            .correlate_except(max_valid_lap)
            .scalar_subquery(),
        )
        .subquery()
    )

    # Step 3: Rank drivers per lap by cumulative time
    ranked_rows = db.execute(
        select(
            cumulative_cte.c.driver_id,
            cumulative_cte.c.lap_number,
            func.rank()
            .over(partition_by=cumulative_cte.c.lap_number, order_by=cumulative_cte.c.cumulative_ms)
            .label("position"),
        )
    ).all()

    if not ranked_rows:
        return {"raceId": race.id, "totalLaps": 0, "coveredLaps": 0, "drivers": []}

    return _positions_response(db, race, results, race_laps, ranked_rows)


@router.get("/seasons/{year}/races/{round}/pitstops/analysis")
def get_pitstops_analysis(year: int, round: int, db: Session = Depends(get_db)):
    """Pit stop analysis for one race.

    f1db measures a stop as *pit lane* time — the run from the pit entry line to
    the exit line, stationary time included. That total is dominated by how long
    the pit lane is (roughly 13s at Melbourne, 24s at Bahrain), so on its own it
    says little about the crew. What isolates the crew and the traffic is the
    gap to the quickest stop of the same race: the transit is common to
    everyone, so whatever is left over is time genuinely lost. Both are
    reported, and the distribution buckets the gap rather than the total.
    """
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

    empty = {
        "raceId": race.id,
        "totalStops": len(stops),
        "benchmark": None,
        "avgDuration": None,
        "medianDuration": None,
        "avgTimeLost": None,
        "fastestStop": None,
        "teamAverages": [],
        "distribution": [],
    }
    if not stops:
        return empty

    # Build driver -> constructor map from race results
    results = db.execute(select(RaceResult).where(RaceResult.race_id == race.id)).scalars().all()
    driver_constructor = {r.driver_id: r.constructor for r in results}

    valid_stops = [s for s in stops if s.duration_ms is not None]
    if not valid_stops:
        return empty

    # Fastest stop — already sorted by duration, and the benchmark everything
    # else is measured against.
    fastest = valid_stops[0]
    fastest_constructor = driver_constructor.get(fastest.driver_id)
    benchmark_ms = fastest.duration_ms

    durations = [s.duration_ms for s in valid_stops]
    avg_duration = sum(durations) / len(durations)
    median_duration = statistics.median(durations)

    # Team averages, ranked by time lost against the benchmark
    team_totals: dict[str, dict] = {}
    for s in valid_stops:
        constructor = driver_constructor.get(s.driver_id)
        if not constructor:
            continue
        entry = team_totals.setdefault(
            constructor.id,
            {"constructor": constructor, "total_ms": 0, "best_ms": s.duration_ms, "count": 0},
        )
        entry["total_ms"] += s.duration_ms
        entry["best_ms"] = min(entry["best_ms"], s.duration_ms)
        entry["count"] += 1

    team_averages = sorted(
        [
            {
                "constructor": {
                    "ref": t["constructor"].ref,
                    "name": t["constructor"].name,
                    "color": t["constructor"].color,
                },
                "avgDuration": _seconds(t["total_ms"] / t["count"]),
                "bestDuration": _seconds(t["best_ms"]),
                "avgTimeLost": _seconds(t["total_ms"] / t["count"] - benchmark_ms),
                "stopCount": t["count"],
            }
            for t in team_totals.values()
        ],
        key=lambda x: float(x["avgTimeLost"]),
    )

    # Distribution of time lost against the race benchmark. Bucketing the raw
    # total instead drops every stop of a race into a single bar, since the
    # spread within one pit lane is only a couple of seconds wide.
    buckets = (
        ("+0.0-0.5s", 0, 500),
        ("+0.5-1.0s", 500, 1000),
        ("+1.0-2.0s", 1000, 2000),
        ("+2.0-5.0s", 2000, 5000),
        ("+5.0s or more", 5000, float("inf")),
    )
    distribution = [
        {
            "range": label,
            "count": sum(1 for s in valid_stops if low <= s.duration_ms - benchmark_ms < high),
        }
        for label, low, high in buckets
    ]

    return {
        "raceId": race.id,
        "totalStops": len(stops),
        "benchmark": _seconds(benchmark_ms),
        "avgDuration": _seconds(avg_duration),
        "medianDuration": _seconds(median_duration),
        "avgTimeLost": _seconds(avg_duration - benchmark_ms),
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
            "duration": _seconds(benchmark_ms),
            "stopNumber": fastest.stop_number,
        },
        "teamAverages": team_averages,
        "distribution": distribution,
    }


def _positions_response(db: Session, race, results, race_laps: int, rows) -> dict:
    """Shape `(driver_id, lap_number, position)` rows into the positions payload.

    Shared by both sources — Fast-F1's stored positions and the reconstruction
    from lap times — so the two cannot drift in what they return.
    """
    driver_grid = {r.driver_id: r.grid for r in results}
    driver_constructor = {r.driver_id: r.constructor for r in results}
    driver_final_pos = {r.driver_id: r.position for r in results}

    positions_by_driver: dict[str, dict[int, int]] = defaultdict(dict)
    max_lap = 0
    driver_ids_seen: set[str] = set()
    for driver_id, lap_number, position in rows:
        positions_by_driver[driver_id][lap_number] = position
        driver_ids_seen.add(driver_id)
        max_lap = max(max_lap, lap_number)

    if not driver_ids_seen:
        return {"raceId": race.id, "totalLaps": 0, "coveredLaps": 0, "drivers": []}

    # The grid is where everyone was before lap 1, so it anchors the chart at 0.
    for driver_id in driver_ids_seen:
        grid = driver_grid.get(driver_id)
        if grid:
            positions_by_driver[driver_id][0] = grid

    drivers = db.execute(select(Driver).where(Driver.id.in_(driver_ids_seen))).scalars().all()
    driver_map = {d.id: d for d in drivers}

    # Finishing order, so the chart's default selection is the front of the field.
    sorted_driver_ids = sorted(driver_ids_seen, key=lambda d: driver_final_pos.get(d) or 999)

    drivers_data = []
    for driver_id in sorted_driver_ids:
        driver = driver_map.get(driver_id)
        if not driver:
            continue
        constructor = driver_constructor.get(driver_id)
        positions = positions_by_driver.get(driver_id, {})
        drivers_data.append(
            {
                "driver": driver_summary(driver),
                "constructor": constructor_compact(constructor) if constructor else {},
                "positions": [
                    {"lap": lap_num, "position": pos} for lap_num, pos in sorted(positions.items())
                ],
            }
        )

    return {
        "raceId": race.id,
        # The race's length, so the chart's axis is the race and not whatever
        # the timing data happened to cover...
        "totalLaps": max(race_laps, max_lap),
        # ...and how far the data actually got, so the UI can say when it falls
        # short instead of implying the race ended there.
        "coveredLaps": max_lap,
        "drivers": drivers_data,
    }
