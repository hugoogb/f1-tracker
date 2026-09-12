from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.api.constants import DEFAULT_PROGRESSION_TOP, MAX_PROGRESSION_TOP
from src.api.serializers import constructor_compact, constructor_summary, driver_summary
from src.db.database import get_db
from src.db.models import (
    Constructor,
    Race,
    RaceResult,
    SprintResult,
)
from src.db.queries import (
    get_constructor_standings_for_season,
    get_driver_standings_for_season,
)

router = APIRouter()


def _raced(races: list[Race], race_points: dict[str, dict[str, float]]) -> list[Race]:
    """Trim a season's calendar to the rounds that have been run.

    A season in progress still lists its remaining rounds, and charting those
    draws every line flat out to the end of the year as if the championship had
    already been decided.
    """
    last = 0
    for index, race in enumerate(races, start=1):
        if race_points.get(race.id):
            last = index
    return races[:last]


@router.get("/seasons/{year}/standings/drivers")
def driver_standings(year: int, db: Session = Depends(get_db)):
    standings = get_driver_standings_for_season(db, year)

    # Build a map of driver_id -> constructor for the last race of the season
    constructor_map: dict[str, Constructor | None] = {}
    if standings:
        last_race_id = standings[0].race_id
        driver_ids = [s.driver_id for s in standings]
        results = (
            db.execute(
                select(RaceResult).where(
                    RaceResult.race_id == last_race_id,
                    RaceResult.driver_id.in_(driver_ids),
                )
            )
            .scalars()
            .all()
        )
        constructor_ids = {r.constructor_id for r in results}
        constructors = (
            (
                db.execute(select(Constructor).where(Constructor.id.in_(constructor_ids)))
                .scalars()
                .all()
            )
            if constructor_ids
            else []
        )
        c_map = {c.id: c for c in constructors}
        result_map = {r.driver_id: r.constructor_id for r in results}
        for did in driver_ids:
            cid = result_map.get(did)
            constructor_map[did] = c_map.get(cid) if cid else None

    return {
        "year": year,
        "standings": [
            {
                "position": s.position,
                "points": s.points,
                "wins": s.wins,
                "driver": driver_summary(s.driver),
                "constructor": constructor_compact(c)
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
                "constructor": constructor_summary(s.constructor),
            }
            for s in standings
        ],
    }


@router.get("/seasons/{year}/standings/progression")
def standings_progression(
    year: int,
    top: int = Query(DEFAULT_PROGRESSION_TOP, ge=1, le=MAX_PROGRESSION_TOP),
    db: Session = Depends(get_db),
):
    """Round-by-round championship progression for the season."""
    races = (
        db.execute(select(Race).where(Race.season_year == year).order_by(Race.round))
        .scalars()
        .all()
    )
    if not races:
        return {"year": year, "rounds": [], "drivers": []}

    race_ids = [r.id for r in races]
    race_round = {r.id: r.round for r in races}

    # Get final standings to determine top N drivers
    final_standings = get_driver_standings_for_season(db, year)
    top_driver_ids = [s.driver_id for s in final_standings[:top]]

    # Fetch all race + sprint points for top drivers in this season. The race
    # rows also carry the constructor, which is where each line's colour comes
    # from — taking it from the last scheduled race would leave every driver
    # colourless mid-season, when that race has not been run yet.
    race_points_rows = db.execute(
        select(
            RaceResult.race_id,
            RaceResult.driver_id,
            RaceResult.constructor_id,
            RaceResult.points,
        ).where(
            RaceResult.race_id.in_(race_ids),
            RaceResult.driver_id.in_(top_driver_ids),
        )
    ).all()
    sprint_points_rows = db.execute(
        select(
            SprintResult.race_id,
            SprintResult.driver_id,
            SprintResult.points,
        ).where(
            SprintResult.race_id.in_(race_ids),
            SprintResult.driver_id.in_(top_driver_ids),
        )
    ).all()

    # Each driver's most recent constructor: the one they last actually raced for.
    latest_constructor: dict[str, tuple[int, str]] = {}
    for race_id, driver_id, constructor_id, _pts in race_points_rows:
        rnd = race_round[race_id]
        seen = latest_constructor.get(driver_id)
        if seen is None or rnd > seen[0]:
            latest_constructor[driver_id] = (rnd, constructor_id)

    constructor_ids = {cid for _, cid in latest_constructor.values()}
    c_map = (
        {
            c.id: c
            for c in db.execute(select(Constructor).where(Constructor.id.in_(constructor_ids)))
            .scalars()
            .all()
        }
        if constructor_ids
        else {}
    )

    driver_info: dict = {}
    for s in final_standings[:top]:
        driver = s.driver
        entry = latest_constructor.get(driver.id)
        constructor = c_map.get(entry[1]) if entry else None
        driver_info[driver.id] = {
            "ref": driver.ref,
            "code": driver.code,
            "firstName": driver.first_name,
            "lastName": driver.last_name,
            "constructorRef": constructor.ref if constructor else None,
            "color": (constructor.color if constructor else None),
        }

    # Build per-race points map: {race_id: {driver_id: points}}
    race_points: dict[str, dict[str, float]] = {}
    for race_id, driver_id, _cid, pts in race_points_rows:
        race_points.setdefault(race_id, {})[driver_id] = pts
    for race_id, driver_id, pts in sprint_points_rows:
        race_points.setdefault(race_id, {}).setdefault(driver_id, 0)
        race_points[race_id][driver_id] += pts

    # Build cumulative round-by-round data, stopping at the last round actually
    # run so an in-progress season does not trail off into a flat line.
    cumulative: dict[str, float] = {did: 0.0 for did in top_driver_ids}
    rounds = []
    for race in _raced(races, race_points):
        round_pts = race_points.get(race.id, {})
        round_data: dict = {"round": race.round, "raceName": race.name}
        for did in top_driver_ids:
            cumulative[did] += round_pts.get(did, 0)
            info = driver_info.get(did)
            if info:
                round_data[info["ref"]] = cumulative[did]
        rounds.append(round_data)

    return {
        "year": year,
        "rounds": rounds,
        "drivers": [driver_info[did] for did in top_driver_ids if did in driver_info],
    }


@router.get("/seasons/{year}/standings/constructors/progression")
def constructor_standings_progression(
    year: int,
    top: int = Query(DEFAULT_PROGRESSION_TOP, ge=1, le=MAX_PROGRESSION_TOP),
    db: Session = Depends(get_db),
):
    """Round-by-round constructor championship progression for the season."""
    races = (
        db.execute(select(Race).where(Race.season_year == year).order_by(Race.round))
        .scalars()
        .all()
    )
    if not races:
        return {"year": year, "rounds": [], "constructors": []}

    race_ids = [r.id for r in races]

    # Get final constructor standings to determine top N
    final_standings = get_constructor_standings_for_season(db, year)
    top_constructor_ids = [s.constructor_id for s in final_standings[:top]]

    constructor_info: dict = {}
    for s in final_standings[:top]:
        c = s.constructor
        constructor_info[c.id] = {
            "ref": c.ref,
            "name": c.name,
            "color": c.color,
        }

    # Fetch all race + sprint points for top constructors
    race_points_rows = db.execute(
        select(
            RaceResult.race_id,
            RaceResult.constructor_id,
            func.sum(RaceResult.points).label("pts"),
        )
        .where(
            RaceResult.race_id.in_(race_ids),
            RaceResult.constructor_id.in_(top_constructor_ids),
        )
        .group_by(RaceResult.race_id, RaceResult.constructor_id)
    ).all()
    sprint_points_rows = db.execute(
        select(
            SprintResult.race_id,
            SprintResult.constructor_id,
            func.sum(SprintResult.points).label("pts"),
        )
        .where(
            SprintResult.race_id.in_(race_ids),
            SprintResult.constructor_id.in_(top_constructor_ids),
        )
        .group_by(SprintResult.race_id, SprintResult.constructor_id)
    ).all()

    race_points: dict[str, dict[str, float]] = {}
    for race_id, cid, pts in race_points_rows:
        race_points.setdefault(race_id, {})[cid] = pts
    for race_id, cid, pts in sprint_points_rows:
        race_points.setdefault(race_id, {}).setdefault(cid, 0)
        race_points[race_id][cid] += pts

    cumulative: dict[str, float] = {cid: 0.0 for cid in top_constructor_ids}
    rounds = []
    for race in _raced(races, race_points):
        round_pts = race_points.get(race.id, {})
        round_data: dict = {"round": race.round, "raceName": race.name}
        for cid in top_constructor_ids:
            cumulative[cid] += round_pts.get(cid, 0)
            info = constructor_info.get(cid)
            if info:
                round_data[info["ref"]] = cumulative[cid]
        rounds.append(round_data)

    return {
        "year": year,
        "rounds": rounds,
        "constructors": [
            constructor_info[cid] for cid in top_constructor_ids if cid in constructor_info
        ],
    }
