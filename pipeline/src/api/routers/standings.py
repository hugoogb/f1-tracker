from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.api.constants import DEFAULT_PROGRESSION_TOP, MAX_PROGRESSION_TOP
from src.api.serializers import constructor_compact, constructor_summary, driver_summary
from src.db.database import get_db
from src.db.models import (
    Constructor,
    Driver,
    Race,
    RaceResult,
    SprintResult,
)
from src.db.queries import (
    get_constructor_standings_for_season,
    get_driver_standings_for_season,
)
from src.scoring import SYSTEMS, PointsSystem, sprint_system_for_year, system_for_year

router = APIRouter()


def _system_payload(system: PointsSystem) -> dict:
    return {
        "id": system.id,
        "label": system.label,
        "era": system.era,
        "racePoints": list(system.race_points),
        "sprintPoints": list(system.sprint_points),
        "fastestLapPoint": system.fastest_lap_point,
        "fastestLapWithin": system.fastest_lap_within,
        "notes": system.notes,
    }


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


@router.get("/points-systems")
def list_points_systems():
    """Every points system the championship has used, oldest first.

    The cross-era normalisation below re-scores a season under one of these, so
    the UI needs the list to build its selector.
    """
    return {"systems": [_system_payload(s) for s in SYSTEMS.values()]}


@router.get("/seasons/{year}/standings/normalised")
def normalised_standings(
    year: int,
    system: str = Query(..., description="Points system id, from /api/points-systems"),
    db: Session = Depends(get_db),
):
    """Re-score a season under a different era's points system.

    This is a hypothetical, and the response says so: `official` is what
    actually happened and is the only table the site treats as the record.

    Two things it deliberately does not model, because modelling them would make
    the comparison dishonest rather than more accurate:

    * **Dropped scores.** Until 1990 only a driver's best N results counted, and
      that is exactly why the official standings come from f1db rather than from
      summing races. Re-scoring applies the chosen system to *every* result, for
      every season, so the two eras are compared on the same basis — which is
      the whole point, and also why 1988 moves.
    * **Half points and shared drives.** A handful of races paid half points,
      and 1950s drivers could share a car and split the score. Both are applied
      to the official totals and neither is recoverable from a finishing
      position, so a normalised total for those seasons is approximate.

    Nobody would have driven the same race under different rules, either. The
    table answers "who scored most under these rules", not "who would have won".
    """
    points_system = SYSTEMS.get(system)
    if points_system is None:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown points system '{system}'",
        )

    races = (
        db.execute(select(Race).where(Race.season_year == year).order_by(Race.round))
        .scalars()
        .all()
    )
    if not races:
        raise HTTPException(status_code=404, detail="Season not found")

    race_ids = [r.id for r in races]
    results = db.execute(select(RaceResult).where(RaceResult.race_id.in_(race_ids))).scalars().all()
    if not results:
        raise HTTPException(status_code=404, detail="Season has no results")

    points: dict[str, float] = defaultdict(float)
    wins: dict[str, int] = defaultdict(int)
    podiums: dict[str, int] = defaultdict(int)
    finishes: dict[str, int] = defaultdict(int)

    for result in results:
        if result.position is None:
            continue
        points[result.driver_id] += points_system.points_for(result.position)
        finishes[result.driver_id] += 1
        if result.position == 1:
            wins[result.driver_id] += 1
        if result.position <= 3:
            podiums[result.driver_id] += 1

    # The fastest-lap point, where the chosen system pays one. f1db precomputes
    # the race's fastest lap, so this does not have to trawl lap times.
    if points_system.fastest_lap_point:
        finishing_position = {(r.race_id, r.driver_id): r.position for r in results}
        for race in races:
            driver_id = race.fastest_lap_driver_id
            if not driver_id:
                continue
            limit = points_system.fastest_lap_within
            position = finishing_position.get((race.id, driver_id))
            if limit and (position is None or position > limit):
                continue
            points[driver_id] += 1.0

    # Sprints only exist from 2021, and only score if the chosen system has a
    # sprint scale at all — scoring a 2023 sprint under 1961's rules would be
    # inventing a race that system never had to deal with.
    sprint_scale = points_system.sprint_points or sprint_system_for_year(year)
    sprints_counted = 0
    if points_system.sprint_points:
        sprint_results = (
            db.execute(select(SprintResult).where(SprintResult.race_id.in_(race_ids)))
            .scalars()
            .all()
        )
        for sprint in sprint_results:
            if sprint.position is None:
                continue
            index = sprint.position - 1
            if 0 <= index < len(sprint_scale):
                points[sprint.driver_id] += sprint_scale[index]
                sprints_counted += 1

    official = get_driver_standings_for_season(db, year)
    official_points = {s.driver_id: s.points for s in official}
    official_position = {s.driver_id: s.position for s in official}

    # Countback on wins, then podiums — the sport's own tie-break, and the only
    # one that can be applied to a re-scored table without inventing a rule.
    ranked = sorted(
        points,
        key=lambda did: (-points[did], -wins[did], -podiums[did]),
    )

    drivers = db.execute(select(Driver).where(Driver.id.in_(ranked))).scalars().all()
    driver_map = {d.id: d for d in drivers}

    rows = []
    for position, driver_id in enumerate(ranked, start=1):
        driver = driver_map.get(driver_id)
        if driver is None:
            continue
        was = official_position.get(driver_id)
        rows.append(
            {
                "position": position,
                "driver": driver_summary(driver),
                "points": round(points[driver_id], 2),
                "wins": wins[driver_id],
                "podiums": podiums[driver_id],
                "officialPosition": was,
                "officialPoints": official_points.get(driver_id),
                "positionDelta": (was - position) if was else None,
            }
        )

    actual = system_for_year(year)
    champion_changed = bool(rows and official and rows[0]["driver"]["id"] != official[0].driver_id)

    return {
        "year": year,
        "system": _system_payload(points_system),
        "actualSystem": _system_payload(actual),
        "isActualSystem": points_system.id == actual.id,
        "championChanged": champion_changed,
        "sprintsCounted": sprints_counted,
        "standings": rows,
    }


@router.get("/seasons/{year}/permutations")
def title_permutations(year: int, db: Session = Depends(get_db)):
    """Who can still win the drivers' championship, and by how much.

    The elimination test is the strict one: a driver is out only when their
    current points plus every point still on the table is less than the
    leader's total *now*. That assumes the leader scores nothing again all
    season, which is why the answer stays "mathematically alive" long after it
    stops being realistic — but it is the only version of the question with a
    definite answer.

    Where two drivers can only finish level, the championship is decided on a
    countback of wins, which no arithmetic here can project. Those cases come
    back flagged rather than resolved.
    """
    races = (
        db.execute(select(Race).where(Race.season_year == year).order_by(Race.round))
        .scalars()
        .all()
    )
    if not races:
        raise HTTPException(status_code=404, detail="Season not found")

    rounds_with_results = set(
        db.execute(
            select(RaceResult.race_id)
            .where(RaceResult.race_id.in_([r.id for r in races]))
            .distinct()
        )
        .scalars()
        .all()
    )
    remaining_races = [r for r in races if r.id not in rounds_with_results]

    # f1db schedules the sprint sessions for the seasons around the present day,
    # which are exactly the ones this endpoint is useful for. A remaining round
    # with a sprint session on the calendar is a sprint weekend; without the
    # schedule there is no way to know, and the flag says so rather than
    # guessing a number that would move the arithmetic.
    sprints_remaining = sum(1 for r in remaining_races if r.sprint_race_at is not None)
    sprint_schedule_known = year < 2021 or any(r.sprint_race_at is not None for r in races)

    system = system_for_year(year)
    sprint_scale = sprint_system_for_year(year)
    sprint_win = sprint_scale[0] if sprint_scale else 0.0

    max_remaining = len(remaining_races) * system.max_per_round + sprints_remaining * sprint_win

    standings = get_driver_standings_for_season(db, year)
    if not standings:
        return {
            "year": year,
            "decided": False,
            "started": False,
            "roundsRun": 0,
            "totalRounds": len(races),
            "contenders": [],
        }

    leader = standings[0]
    rounds_run = len(rounds_with_results)
    season_complete = not remaining_races

    contenders = []
    for standing in standings:
        max_possible = standing.points + max_remaining
        deficit = leader.points - standing.points
        if standing.driver_id == leader.driver_id:
            alive, only_on_countback = True, False
        else:
            alive = max_possible >= leader.points
            only_on_countback = max_possible == leader.points
        contenders.append(
            {
                "position": standing.position,
                "driver": driver_summary(standing.driver),
                "points": standing.points,
                "wins": standing.wins,
                "maxPossible": round(max_possible, 2),
                "deficit": round(deficit, 2),
                "alive": alive,
                # A driver who can at best draw level does not win on points; the
                # title would come down to a countback on wins.
                "onlyOnCountback": only_on_countback,
                "isLeader": standing.driver_id == leader.driver_id,
            }
        )

    alive_count = sum(1 for c in contenders if c["alive"])
    # Mathematically settled once nobody else can reach the leader, which can
    # happen several rounds before the finale.
    decided = season_complete or alive_count <= 1

    # What the leader still has to do. The margin that ends it is one point more
    # than everything still available to a rival; whether the next round can
    # deliver that margin depends on what is left after it.
    next_race = remaining_races[0] if remaining_races else None
    max_next_round = system.max_per_round + (
        sprint_win if next_race is not None and next_race.sprint_race_at is not None else 0.0
    )
    max_after_next = max(max_remaining - max_next_round, 0.0)
    runner_up = next((c for c in contenders if not c["isLeader"]), None)

    return {
        "year": year,
        "started": True,
        "decided": decided,
        "seasonComplete": season_complete,
        "roundsRun": rounds_run,
        "totalRounds": len(races),
        "racesRemaining": len(remaining_races),
        "sprintsRemaining": sprints_remaining,
        "sprintScheduleKnown": sprint_schedule_known,
        "maxRemaining": round(max_remaining, 2),
        "pointsSystem": _system_payload(system),
        "nextRound": (
            {"round": next_race.round, "name": next_race.name} if next_race is not None else None
        ),
        # The scenario every broadcast means by "he can win it next time out":
        # the leader takes the maximum at the next round, the runner-up scores
        # nothing there, and even taking everything left afterwards the
        # runner-up finishes short.
        "canClinchNextRound": bool(
            runner_up is not None
            and not decided
            and (leader.points + max_next_round) - runner_up["points"] > max_after_next
        ),
        "marginToClinch": round(max_remaining + 1, 2) if not decided else 0,
        "aliveCount": alive_count,
        "contenders": contenders,
    }
