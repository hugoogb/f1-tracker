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
    official_running_totals,
)
from src.scoring import (
    DOUBLE_POINTS_FINALES,
    FIRST_CONSTRUCTORS_SEASON,
    FIRST_SEASON_EVERY_CAR_SCORES,
    SYSTEMS,
    PointsSystem,
    max_per_round,
    max_points_remaining,
    sprint_system_for_year,
    still_in_contention,
    system_for_year,
    wins_countback,
)

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
    # run so an in-progress season does not trail off into a flat line. The
    # official table after each round wins where every round has one: before
    # 1991 that is points counted, not scored, and only it ends on the
    # published total. The sum of race and sprint points is the fallback.
    raced = _raced(races, race_points)
    official = official_running_totals(db, raced)
    cumulative: dict[str, float] = {did: 0.0 for did in top_driver_ids}
    rounds = []
    for race in raced:
        round_pts = race_points.get(race.id, {})
        round_data: dict = {"round": race.round, "raceName": race.name}
        for did in top_driver_ids:
            cumulative[did] += round_pts.get(did, 0)
            info = driver_info.get(did)
            if info:
                round_data[info["ref"]] = (
                    official[race.id].get(did, 0.0) if official else cumulative[did]
                )
        rounds.append(round_data)

    return {
        "year": year,
        "pointsSource": "official" if official else "scored",
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

    raced = _raced(races, race_points)
    # Before 1958 there was no constructors' title; f1db has no round tables
    # then, so those seasons fall back to the sum on their own.
    official = official_running_totals(db, raced, constructors=True)
    cumulative: dict[str, float] = {cid: 0.0 for cid in top_constructor_ids}
    rounds = []
    for race in raced:
        round_pts = race_points.get(race.id, {})
        round_data: dict = {"round": race.round, "raceName": race.name}
        for cid in top_constructor_ids:
            cumulative[cid] += round_pts.get(cid, 0)
            info = constructor_info.get(cid)
            if info:
                round_data[info["ref"]] = (
                    official[race.id].get(cid, 0.0) if official else cumulative[cid]
                )
        rounds.append(round_data)

    return {
        "year": year,
        "pointsSource": "official" if official else "scored",
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


def _finishing_counts(db: Session, year: int, up_to_round: int, column) -> dict[str, list[int]]:
    """Each entrant's Grand Prix finishes by position, for the countback.

    Index 0 counts wins, index 1 second places and so on. Only the rounds the
    standings already include, and never sprints: the countback is on Grand
    Prix results.
    """
    rows = db.execute(
        select(column, RaceResult.position, func.count())
        .join(Race, Race.id == RaceResult.race_id)
        .where(
            Race.season_year == year,
            Race.round <= up_to_round,
            RaceResult.position.is_not(None),
            RaceResult.position > 0,
        )
        .group_by(column, RaceResult.position)
    ).all()
    counts: dict[str, list[int]] = defaultdict(list)
    for entity_id, position, n in rows:
        found = counts[entity_id]
        found.extend([0] * (position - len(found)))
        found[position - 1] += n
    return counts


def _permutations(db: Session, year: int, *, constructors: bool) -> dict:
    """Who can still win one of the two titles. See `title_permutations`."""
    races = (
        db.execute(select(Race).where(Race.season_year == year).order_by(Race.round))
        .scalars()
        .all()
    )
    if not races:
        raise HTTPException(status_code=404, detail="Season not found")
    if constructors and year < FIRST_CONSTRUCTORS_SEASON:
        raise HTTPException(
            status_code=404,
            detail=f"There was no constructors' championship before {FIRST_CONSTRUCTORS_SEASON}",
        )

    race_ids = [r.id for r in races]
    rounds_with_results = set(
        db.execute(select(RaceResult.race_id).where(RaceResult.race_id.in_(race_ids)).distinct())
        .scalars()
        .all()
    )
    sprints_run = set(
        db.execute(
            select(SprintResult.race_id).where(SprintResult.race_id.in_(race_ids)).distinct()
        )
        .scalars()
        .all()
    )
    remaining_races = [r for r in races if r.id not in rounds_with_results]

    # f1db schedules the sprint sessions for the seasons around the present day,
    # which are exactly the ones this endpoint is useful for. A remaining round
    # with a sprint session on the calendar is a sprint weekend; without the
    # schedule there is no way to know, and the flag says so rather than
    # guessing a number that would move the arithmetic. A sprint already run on
    # a weekend whose race has not been is no longer on the table.
    def sprint_pending(race: Race) -> bool:
        return race.sprint_race_at is not None and race.id not in sprints_run

    sprints_remaining = sum(1 for r in remaining_races if sprint_pending(r))
    sprint_schedule_known = year < 2021 or any(r.sprint_race_at is not None for r in races)

    system = system_for_year(year)
    max_remaining = max_points_remaining(
        system, len(remaining_races), sprints_remaining, year, constructors=constructors
    )

    standings = (
        get_constructor_standings_for_season(db, year)
        if constructors
        else get_driver_standings_for_season(db, year)
    )
    if not standings:
        return {
            "year": year,
            "kind": "constructors" if constructors else "drivers",
            "decided": False,
            "started": False,
            "roundsRun": 0,
            "totalRounds": len(races),
            "contenders": [],
        }

    def entity_id(standing) -> str:
        return standing.constructor_id if constructors else standing.driver_id

    # Points already scored that the latest official table does not include
    # yet: a sprint run on a weekend whose race has not been, or results in
    # ahead of their table. Leaving them out would understate a chaser.
    table_round = standings[0].race.round
    later_ids = [r.id for r in races if r.round > table_round]
    column = RaceResult.constructor_id if constructors else RaceResult.driver_id
    sprint_column = SprintResult.constructor_id if constructors else SprintResult.driver_id
    banked: dict[str, float] = defaultdict(float)
    if later_ids:
        for model, col in ((RaceResult, column), (SprintResult, sprint_column)):
            for eid, pts in db.execute(
                select(col, func.sum(model.points))
                .where(model.race_id.in_(later_ids))
                .group_by(col)
            ).all():
                banked[eid] += float(pts or 0)

    entries = [
        (standing, standing.points + banked.get(entity_id(standing), 0.0)) for standing in standings
    ]
    # Re-rank only on the banked points; the official order (which already
    # applies the countback) stands wherever totals are level.
    entries.sort(key=lambda e: -e[1])
    leader, leader_points = entries[0]
    leader_id = entity_id(leader)

    finishes = _finishing_counts(db, year, table_round, column)
    races_remaining = len(remaining_races)

    def countback(eid: str, rounds: int, leader_extra_wins: int = 0) -> bool | None:
        leader_record = list(finishes.get(leader_id, []))
        if leader_extra_wins:
            leader_record += [0] * max(2 - len(leader_record), 0)
            leader_record[0] += leader_extra_wins
            if constructors and year >= FIRST_SEASON_EVERY_CAR_SCORES:
                leader_record[1] += leader_extra_wins
        return wins_countback(
            finishes.get(eid, []), leader_record, rounds, constructors=constructors
        )

    contenders = []
    for standing, points in entries:
        eid = entity_id(standing)
        is_leader = eid == leader_id
        max_possible = points + max_remaining
        if is_leader:
            alive, only_on_countback = True, False
        else:
            alive = still_in_contention(
                points,
                leader_points,
                max_remaining,
                countback=countback(eid, races_remaining),
            )
            # Alive, but only by drawing level and winning the countback.
            only_on_countback = alive and max_possible == leader_points
        row = {
            "position": standing.position,
            "points": points,
            "wins": standing.wins,
            "maxPossible": round(max_possible, 2),
            "deficit": round(leader_points - points, 2),
            "alive": alive,
            "onlyOnCountback": only_on_countback,
            "isLeader": is_leader,
        }
        if constructors:
            row["constructor"] = constructor_summary(standing.constructor)
        else:
            row["driver"] = driver_summary(standing.driver)
        contenders.append(row)

    alive_count = sum(1 for c in contenders if c["alive"])
    season_complete = not remaining_races
    # Mathematically settled once nobody else can reach the leader, which can
    # happen several rounds before the finale.
    decided = season_complete or alive_count <= 1

    # What the leader still has to do: take the maximum at the next round while
    # every rival scores nothing there (always possible — points stop at tenth),
    # and still be out of reach of everything left afterwards.
    next_race = remaining_races[0] if remaining_races else None
    can_clinch = False
    if next_race is not None and not decided:
        next_sprints = 1 if sprint_pending(next_race) else 0
        max_next = max_points_remaining(system, 1, next_sprints, year, constructors=constructors)
        if year in DOUBLE_POINTS_FINALES and races_remaining > 1:
            # Only the finale pays double; a single remaining race already is it.
            max_next -= max_per_round(system, year, constructors=constructors)
        max_after = max(max_remaining - max_next, 0.0)
        can_clinch = not any(
            still_in_contention(
                c["points"],
                leader_points + max_next,
                max_after,
                countback=countback(
                    c["constructor"]["id"] if constructors else c["driver"]["id"],
                    races_remaining - 1,
                    leader_extra_wins=1,
                ),
            )
            for c in contenders
            if c["alive"] and not c["isLeader"]
        )

    return {
        "year": year,
        "kind": "constructors" if constructors else "drivers",
        "started": True,
        "decided": decided,
        "seasonComplete": season_complete,
        "roundsRun": len(rounds_with_results),
        "totalRounds": len(races),
        "racesRemaining": races_remaining,
        "sprintsRemaining": sprints_remaining,
        "sprintScheduleKnown": sprint_schedule_known,
        "doublePointsFinale": year in DOUBLE_POINTS_FINALES and races_remaining > 0,
        "maxRemaining": round(max_remaining, 2),
        "pointsSystem": _system_payload(system),
        "nextRound": (
            {"round": next_race.round, "name": next_race.name} if next_race is not None else None
        ),
        # The scenario every broadcast means by "he can win it next time out":
        # the leader takes the maximum at the next round, no rival scores there,
        # and even taking everything left afterwards none of them can catch up.
        "canClinchNextRound": can_clinch,
        "marginToClinch": round(max_remaining + 1, 2) if not decided else 0,
        "aliveCount": alive_count,
        "contenders": contenders,
    }


@router.get("/seasons/{year}/permutations")
def title_permutations(year: int, db: Session = Depends(get_db)):
    """Who can still win the drivers' championship, and by how much.

    The elimination test is the strict one: a driver is out only when their
    current points plus every point still on the table cannot reach the
    leader's total *now*. That assumes the leader scores nothing again all
    season, which is why the answer stays "mathematically alive" long after it
    stops being realistic — but it is the only version of the question with a
    definite answer.

    A rival who can at best draw level has exactly one way to do it — win every
    remaining race while the leader scores nothing — so the countback that
    settles the tie (wins, then second places, ...) is fully determined, and
    the rival is alive only if they would win it (`onlyOnCountback`).
    """
    return _permutations(db, year, constructors=False)


@router.get("/seasons/{year}/permutations/constructors")
def constructor_title_permutations(year: int, db: Session = Depends(get_db)):
    """Who can still win the constructors' championship (1958 onwards).

    The same strict test as the drivers', with a constructor's maximum: a
    one-two in every remaining race and sprint (only the best car scored
    before 1979), plus the fastest-lap point where it was paid.
    """
    return _permutations(db, year, constructors=True)
