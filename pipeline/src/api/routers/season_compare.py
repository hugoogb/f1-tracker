"""Two drivers, or two constructors, compared within a single season.

The career comparison under `/compare` answers "who had the better career";
this answers "how did that season's fight actually go" — round by round, with
the gap between the two sides as the headline.

Conventions every number here follows:

- **Deltas are always A minus B**, where A is `d1`/`c1`. For points that means
  positive favours A; for positions and lap times (lower is better) negative
  favours A. The frontend knows which way each stat points; the API never
  flips a sign to make a delta "read nicely".
- **Points are the official championship totals** from f1db's standings, never
  summed race points. In the pre-1991 "best N results" seasons a driver could
  score and have it not count, and only the standings know that. Per-round
  points are the step in the official cumulative total, so a dropped result
  shows as the zero it was. The one exception is a season with no official
  table at all — there was no constructors' championship before 1958 — where
  the totals are summed from results and `pointsSource` says so.
- **Timing data is reported with its coverage.** Qualifying times, Fast-F1 lap
  positions and lap times all have gaps, so every derived figure says how many
  rounds (or laps) it rests on and is null, not zero, when there is nothing.
"""

import statistics
from collections import defaultdict
from collections.abc import Callable, Iterable

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.api.constants import SEASON_COMPARE_MIN_CLEAN_LAPS
from src.api.routers.races import _CLEAN_LAP_THRESHOLD, _cumulative_lap_times
from src.api.serializers import constructor_compact, constructor_summary, driver_summary
from src.db.database import get_db
from src.db.models import (
    Constructor,
    ConstructorStanding,
    Driver,
    DriverStanding,
    LapTime,
    QualifyingResult,
    RaceResult,
    SprintResult,
)
from src.db.queries import (
    get_constructor_by_ref,
    get_constructor_standings_for_season,
    get_driver_by_ref,
    get_driver_standings_for_season,
    get_season_races,
)

router = APIRouter()

# f1db spells a retirement "DNF"; Ergast-era data used "R".
_DNF_TEXTS = {"DNF", "R", "RET"}
# Rows in the race results that never took the start.
_NOT_STARTED_TEXTS = {"DNS", "DNQ", "DNPQ", "DNP", "EX", "W"}
_QUALI_SESSIONS = ("q3", "q2", "q1")


def _lap_ms(text: str | None) -> int | None:
    """A lap time string ('1:23.456' or '83.456') as milliseconds."""
    if not text:
        return None
    try:
        if ":" in text:
            minutes, seconds = text.split(":", 1)
            return round((int(minutes) * 60 + float(seconds)) * 1000)
        return round(float(text) * 1000)
    except ValueError:
        return None


def _delta(a: float | None, b: float | None, digits: int = 3) -> float | None:
    if a is None or b is None:
        return None
    return round(a - b, digits)


def _pair(a: float | None, b: float | None, digits: int = 3) -> dict:
    return {"a": a, "b": b, "delta": _delta(a, b, digits)}


def _mean(values: Iterable[float], digits: int = 2) -> float | None:
    values = list(values)
    return round(statistics.fmean(values), digits) if values else None


def _started(row: RaceResult) -> bool:
    return (row.position_text or "").upper() not in _NOT_STARTED_TEXTS


def _race_key(row: RaceResult) -> tuple[int, int]:
    """Sort key for "who was ahead at the flag": classified first, then laps run."""
    if row.position is not None:
        return (0, row.position)
    return (1, -(row.laps or 0))


def _h2h(a_keys: dict, b_keys: dict) -> dict:
    """Count rounds each side was ahead, over the rounds both have a key for."""
    shared = sorted(set(a_keys) & set(b_keys))
    a_wins = sum(1 for k in shared if a_keys[k] < b_keys[k])
    b_wins = sum(1 for k in shared if b_keys[k] < a_keys[k])
    return {"a": a_wins, "b": b_wins, "ties": len(shared) - a_wins - b_wins, "total": len(shared)}


class _SeasonData:
    """Everything one season comparison reads, fetched once and filtered in memory.

    A season is at most a few hundred result rows, so pulling them in one go
    and testing membership per side is far cheaper than a query per stat.
    """

    def __init__(self, db: Session, year: int):
        self.db = db
        self.year = year
        self.races = get_season_races(db, year)
        if not self.races:
            raise HTTPException(status_code=404, detail="Season not found")
        race_ids = [r.id for r in self.races]

        self.results: dict[str, list[RaceResult]] = defaultdict(list)
        for row in db.execute(select(RaceResult).where(RaceResult.race_id.in_(race_ids))).scalars():
            self.results[row.race_id].append(row)

        self.sprints: dict[str, list[SprintResult]] = defaultdict(list)
        for row in db.execute(
            select(SprintResult).where(SprintResult.race_id.in_(race_ids))
        ).scalars():
            self.sprints[row.race_id].append(row)

        self.quali: dict[str, list[QualifyingResult]] = defaultdict(list)
        for row in db.execute(
            select(QualifyingResult).where(QualifyingResult.race_id.in_(race_ids))
        ).scalars():
            self.quali[row.race_id].append(row)

        # Rounds actually run: a season in progress lists its remaining rounds,
        # and comparing those would draw both lines flat to December.
        self.raced = [r for r in self.races if self.results.get(r.id)]


class _Side:
    """One side of the comparison: who it is and which result rows are theirs."""

    def __init__(self, entity, member: Callable[[object], bool], is_fastest: Callable):
        self.entity = entity
        self.member = member
        self.is_fastest = is_fastest

    def rows(self, rows: Iterable) -> list:
        return [r for r in rows if self.member(r)]


def _official_cumulative(
    db: Session, model, key_column, entity_id: str, race_ids: list[str]
) -> dict[str, float]:
    rows = db.execute(
        select(model.race_id, model.points).where(
            model.race_id.in_(race_ids), key_column == entity_id
        )
    ).all()
    return {race_id: float(points or 0) for race_id, points in rows}


def _season_has_standings(db: Session, model, race_ids: list[str]) -> bool:
    return (db.execute(select(func.count()).where(model.race_id.in_(race_ids))).scalar() or 0) > 0


def _laps_led(db: Session, data: _SeasonData) -> dict[str, dict]:
    """Laps led per driver per race, and how many laps that count covers.

    Fast-F1's own `Position` is the source wherever it was stored. For races
    ingested before that column existed, the leader of a lap is the driver with
    the lowest elapsed time from `_cumulative_lap_times()` — but only on laps
    where every driver still running has an unbroken chain to that lap. A
    driver whose chain broke is simply missing from the minimum, and if that
    driver was leading the lap would be credited to whoever was second, so
    those laps are left uncovered instead of guessed.
    """
    race_ids = [r.id for r in data.raced]
    out: dict[str, dict] = {}

    position_rows = db.execute(
        select(LapTime.race_id, LapTime.driver_id, LapTime.lap_number, LapTime.position).where(
            LapTime.race_id.in_(race_ids), LapTime.position.isnot(None)
        )
    ).all()
    by_race: dict[str, list] = defaultdict(list)
    for row in position_rows:
        by_race[row.race_id].append(row)

    for race_id, rows in by_race.items():
        led: dict[str, int] = defaultdict(int)
        laps = set()
        for row in rows:
            laps.add(row.lap_number)
            if row.position == 1:
                led[row.driver_id] += 1
        out[race_id] = {"led": dict(led), "coveredLaps": len(laps)}

    timed_races = (
        db.execute(
            select(func.distinct(LapTime.race_id)).where(
                LapTime.race_id.in_(race_ids), LapTime.race_id.notin_(list(by_race))
            )
        )
        .scalars()
        .all()
    )
    for race_id in timed_races:
        cumulative = _cumulative_lap_times(race_id)
        rows = db.execute(
            select(cumulative.c.driver_id, cumulative.c.lap_number, cumulative.c.cumulative_ms)
        ).all()
        by_lap: dict[int, list[tuple[int, str]]] = defaultdict(list)
        for driver_id, lap_number, cumulative_ms in rows:
            by_lap[lap_number].append((cumulative_ms, driver_id))

        running = [r.laps or 0 for r in data.results[race_id]]
        led = defaultdict(int)
        covered = 0
        for lap_number, entries in by_lap.items():
            if len(entries) < sum(1 for laps in running if laps >= lap_number):
                continue
            covered += 1
            led[min(entries)[1]] += 1
        if covered:
            out[race_id] = {"led": dict(led), "coveredLaps": covered}

    return out


def _race_laps(db: Session, data: _SeasonData) -> dict[str, list]:
    """Every timed lap after lap 1, per race, for the clean-lap pace comparison."""
    rows = db.execute(
        select(LapTime.race_id, LapTime.driver_id, LapTime.time_millis).where(
            LapTime.race_id.in_([r.id for r in data.raced]),
            LapTime.time_millis.isnot(None),
            # A standing start is not a measure of pace.
            LapTime.lap_number > 1,
        )
    ).all()
    by_race: dict[str, list] = defaultdict(list)
    for row in rows:
        by_race[row.race_id].append(row)
    return by_race


def _quali_gap(a_rows: list[QualifyingResult], b_rows: list[QualifyingResult]) -> dict | None:
    """Best-time gap in the last qualifying session both sides set a time in.

    Comparing one side's Q3 lap with the other's Q1 lap would set a rubbered-in
    track on low fuel against a green one, so the gap is taken in the deepest
    session both reached. For a constructor each side's time is its quicker car.
    """
    for session in _QUALI_SESSIONS:
        a_times = [t for r in a_rows if (t := _lap_ms(getattr(r, session)))]
        b_times = [t for r in b_rows if (t := _lap_ms(getattr(r, session)))]
        if a_times and b_times:
            a_best, b_best = min(a_times), min(b_times)
            delta = a_best - b_best
            return {
                "session": session.upper(),
                "aMs": a_best,
                "bMs": b_best,
                "deltaMs": delta,
                "deltaPct": round(delta / min(a_best, b_best) * 100, 3),
            }
    return None


def _race_pace(laps: list, a_drivers: set[str], b_drivers: set[str]) -> dict | None:
    """Median clean-lap time of each side in one race, and the difference.

    "Clean" is the degradation chart's filter: lap 1 is already gone, and
    anything slower than 107% of the race's median lap — a pit lap, a safety
    car, traffic — is dropped, because those are seconds off the pace and the
    difference being measured is tenths. It is still a race-long median, so it
    folds strategy and fuel load in; it says who was quicker on track, not why.
    """
    if not laps:
        return None
    threshold = statistics.median(lap.time_millis for lap in laps) * _CLEAN_LAP_THRESHOLD
    a_clean = [
        lap.time_millis
        for lap in laps
        if lap.driver_id in a_drivers and lap.time_millis <= threshold
    ]
    b_clean = [
        lap.time_millis
        for lap in laps
        if lap.driver_id in b_drivers and lap.time_millis <= threshold
    ]
    if len(a_clean) < SEASON_COMPARE_MIN_CLEAN_LAPS or len(b_clean) < SEASON_COMPARE_MIN_CLEAN_LAPS:
        return None
    a_med, b_med = statistics.median(a_clean), statistics.median(b_clean)
    delta = a_med - b_med
    return {
        "aMedianMs": round(a_med),
        "bMedianMs": round(b_med),
        "deltaMs": round(delta),
        "deltaPct": round(delta / min(a_med, b_med) * 100, 3),
        "aCleanLaps": len(a_clean),
        "bCleanLaps": len(b_clean),
    }


def _empty_totals() -> dict:
    totals: dict = defaultdict(int)
    totals.update({"grids": [], "finishes": [], "lapsLed": None})
    return totals


def _compare(
    db: Session,
    data: _SeasonData,
    a: _Side,
    b: _Side,
    *,
    standings_model,
    standings_key,
    per_car: bool,
) -> dict:
    """The shared body of both endpoints; `per_car` marks the constructor case."""
    raced_ids = [r.id for r in data.raced]
    official = _season_has_standings(db, standings_model, raced_ids)
    official_cum = {
        side: _official_cumulative(db, standings_model, standings_key, side.entity.id, raced_ids)
        for side in (a, b)
    }
    laps_led = _laps_led(db, data)
    race_laps = _race_laps(db, data)

    rounds = []
    cumulative = {a: 0.0, b: 0.0}
    race_keys: dict[_Side, dict[int, tuple]] = {a: {}, b: {}}
    quali_keys: dict[_Side, dict[int, int]] = {a: {}, b: {}}
    totals: dict[_Side, dict] = {side: _empty_totals() for side in (a, b)}
    quali_gaps, pace_deltas = [], []
    shared_rounds = 0
    led_rounds = 0

    for race in data.raced:
        results = data.results[race.id]
        quali = data.quali[race.id]
        sides_round = {}
        for side in (a, b):
            rows = side.rows(results)
            sprint_rows = side.rows(data.sprints.get(race.id, []))
            q_rows = side.rows(quali)
            started = [r for r in rows if _started(r)]

            scored = sum(r.points or 0 for r in rows) + sum(r.points or 0 for r in sprint_rows)
            previous = cumulative[side]
            if official:
                cumulative[side] = official_cum[side].get(race.id, previous)
            else:
                cumulative[side] = previous + scored
            points = round(cumulative[side] - previous, 2)

            finishes = [r.position for r in rows if r.position is not None]
            grids = [r.grid for r in started if r.grid]
            q_positions = [r.position for r in q_rows if r.position is not None]

            if started:
                race_keys[side][race.round] = min(_race_key(r) for r in started)
            if q_positions:
                quali_keys[side][race.round] = min(q_positions)

            t = totals[side]
            t["starts"] += len(started)
            t["wins"] += sum(1 for p in finishes if p == 1)
            t["podiums"] += sum(1 for p in finishes if p <= 3)
            t["pointsFinishes"] += sum(1 for r in rows if (r.points or 0) > 0)
            t["dnfs"] += sum(1 for r in rows if (r.position_text or "").upper() in _DNF_TEXTS)
            # Pole is the qualifying result, not the grid — a penalty moves the
            # grid and not the pole. Only races with no qualifying data fall back.
            if quali:
                t["poles"] += sum(1 for p in q_positions if p == 1)
            else:
                t["poles"] += sum(1 for r in started if r.grid == 1)
            t["fastestLaps"] += 1 if side.is_fastest(race) else 0
            t["grids"].extend(grids)
            t["finishes"].extend(finishes)

            led = None
            if race.id in laps_led:
                driver_ids = {r.driver_id for r in rows}
                led = sum(n for did, n in laps_led[race.id]["led"].items() if did in driver_ids)
                t["lapsLed"] = (t["lapsLed"] or 0) + led

            entry = {
                "entered": bool(rows),
                "points": points,
                "cumulativePoints": round(cumulative[side], 2),
                "lapsLed": led,
            }
            if per_car:
                entry["bestFinish"] = min(finishes) if finishes else None
                entry["bestGrid"] = min(grids) if grids else None
                entry["bestQualifying"] = min(q_positions) if q_positions else None
                entry["drivers"] = [
                    {
                        "ref": r.driver.ref,
                        "code": r.driver.code,
                        "lastName": r.driver.last_name,
                        "position": r.position,
                        "positionText": r.position_text,
                        "grid": r.grid,
                    }
                    for r in sorted(rows, key=_race_key)
                ]
            else:
                row = rows[0] if rows else None
                entry["finish"] = row.position if row else None
                entry["positionText"] = row.position_text if row else None
                entry["grid"] = row.grid if row and row.grid else None
                entry["qualifying"] = q_positions[0] if q_positions else None
                entry["constructor"] = constructor_compact(row.constructor) if row else None
            sides_round[side] = (entry, rows, q_rows)

        (a_entry, a_rows, a_q), (b_entry, b_rows, b_q) = sides_round[a], sides_round[b]
        both = a_entry["entered"] and b_entry["entered"]
        shared_rounds += 1 if both else 0
        if a_entry["lapsLed"] is not None:
            led_rounds += 1

        finish_key, grid_key = ("bestFinish", "bestGrid") if per_car else ("finish", "grid")
        quali_gap = _quali_gap(a_q, b_q) if both else None
        pace = (
            _race_pace(
                race_laps.get(race.id, []),
                {r.driver_id for r in a_rows},
                {r.driver_id for r in b_rows},
            )
            if both
            else None
        )
        if quali_gap:
            quali_gaps.append(quali_gap)
        if pace:
            pace_deltas.append(pace)

        race_info = laps_led.get(race.id)
        rounds.append(
            {
                "round": race.round,
                "raceName": race.name,
                "a": a_entry,
                "b": b_entry,
                "pointsDelta": _delta(a_entry["points"], b_entry["points"], 2),
                "cumulativeDelta": _delta(
                    a_entry["cumulativePoints"], b_entry["cumulativePoints"], 2
                ),
                "finishDelta": _delta(a_entry[finish_key], b_entry[finish_key], 0),
                "gridDelta": _delta(a_entry[grid_key], b_entry[grid_key], 0),
                "qualifyingGap": quali_gap,
                "racePace": pace,
                "lapsLedCoverage": (
                    {
                        "coveredLaps": race_info["coveredLaps"],
                        "totalLaps": max((r.laps or 0) for r in data.results[race.id]),
                    }
                    if race_info
                    else None
                ),
            }
        )

    ta, tb = totals[a], totals[b]
    count_keys = ("starts", "wins", "podiums", "poles", "fastestLaps", "dnfs", "pointsFinishes")
    aggregates = {
        "points": _pair(round(cumulative[a], 2), round(cumulative[b], 2), 2),
        **{k: _pair(int(ta[k]), int(tb[k]), 0) for k in count_keys},
        "averageGrid": _pair(_mean(ta["grids"]), _mean(tb["grids"])),
        "averageFinish": _pair(_mean(ta["finishes"]), _mean(tb["finishes"])),
        "lapsLed": _pair(ta["lapsLed"], tb["lapsLed"], 0),
    }

    return {
        "year": data.year,
        "pointsSource": "official" if official else "results",
        "roundsRaced": len(data.raced),
        "roundsShared": shared_rounds,
        "rounds": rounds,
        "aggregates": aggregates,
        "headToHead": {
            "race": _h2h(race_keys[a], race_keys[b]),
            "qualifying": _h2h(quali_keys[a], quali_keys[b]),
        },
        "lapsLedCoverage": {"roundsCovered": led_rounds, "roundsRaced": len(data.raced)},
        "qualifyingGap": (
            {
                "averageDeltaMs": round(statistics.fmean(g["deltaMs"] for g in quali_gaps)),
                "averageDeltaPct": round(statistics.fmean(g["deltaPct"] for g in quali_gaps), 3),
                "medianDeltaPct": round(statistics.median(g["deltaPct"] for g in quali_gaps), 3),
                "roundsCovered": len(quali_gaps),
                "roundsShared": shared_rounds,
            }
            if quali_gaps
            else None
        ),
        "racePace": (
            {
                "averageDeltaMs": round(statistics.fmean(p["deltaMs"] for p in pace_deltas)),
                "averageDeltaPct": round(statistics.fmean(p["deltaPct"] for p in pace_deltas), 3),
                "roundsCovered": len(pace_deltas),
                "roundsShared": shared_rounds,
                "minCleanLaps": SEASON_COMPARE_MIN_CLEAN_LAPS,
            }
            if pace_deltas
            else None
        ),
    }


def _not_entered(kind: str, ref: str, year: int) -> HTTPException:
    return HTTPException(status_code=404, detail=f"{kind} '{ref}' did not race in {year}")


@router.get("/seasons/{year}/compare/entrants")
def season_compare_entrants(year: int, db: Session = Depends(get_db)):
    """Everyone who started a race that season, ordered by the final standings.

    Feeds the pickers on the season comparison page, and its first two of each
    list are the page's default pairing.
    """
    data = _SeasonData(db, year)

    driver_last: dict[str, tuple[int, RaceResult]] = {}
    constructor_points: dict[str, float] = defaultdict(float)
    constructors: dict[str, Constructor] = {}
    for race in data.raced:
        for row in data.results[race.id]:
            driver_last[row.driver_id] = (race.round, row)
            constructor_points[row.constructor_id] += row.points or 0
            constructors[row.constructor_id] = row.constructor

    driver_rank = {
        s.driver_id: s.position for s in get_driver_standings_for_season(db, year) if s.position
    }
    constructor_rank = {
        s.constructor_id: s.position
        for s in get_constructor_standings_for_season(db, year)
        if s.position
    }

    drivers = sorted(
        driver_last.values(),
        key=lambda item: (
            driver_rank.get(item[1].driver_id, 10_000),
            item[1].driver.last_name,
        ),
    )
    # No constructors' championship before 1958: rank by points scored instead.
    ordered_constructors = sorted(
        constructors.values(),
        key=lambda c: (constructor_rank.get(c.id, 10_000), -constructor_points[c.id], c.name),
    )
    return {
        "year": year,
        "drivers": [
            {
                **driver_summary(row.driver),
                "position": driver_rank.get(row.driver_id),
                "constructor": constructor_compact(row.constructor),
            }
            for _, row in drivers
        ],
        "constructors": [
            {**constructor_compact(c), "position": constructor_rank.get(c.id)}
            for c in ordered_constructors
        ],
    }


@router.get("/seasons/{year}/compare/constructors")
def season_compare_constructors(year: int, c1: str, c2: str, db: Session = Depends(get_db)):
    if c1 == c2:
        raise HTTPException(status_code=400, detail="Pick two different constructors")
    data = _SeasonData(db, year)

    sides = []
    for ref in (c1, c2):
        constructor = get_constructor_by_ref(db, ref)
        if not constructor or not any(
            r.constructor_id == constructor.id for race in data.raced for r in data.results[race.id]
        ):
            raise _not_entered("Constructor", ref, year)
        cid = constructor.id
        sides.append(
            _Side(
                constructor,
                member=lambda r, cid=cid: r.constructor_id == cid,
                is_fastest=lambda race, cid=cid: race.fastest_lap_constructor_id == cid,
            )
        )

    a, b = sides
    body = _compare(
        db,
        data,
        a,
        b,
        standings_model=ConstructorStanding,
        standings_key=ConstructorStanding.constructor_id,
        per_car=True,
    )
    return {
        "type": "constructors",
        "a": constructor_summary(a.entity),
        "b": constructor_summary(b.entity),
        **body,
    }


@router.get("/seasons/{year}/compare/drivers")
def season_compare_drivers(year: int, d1: str, d2: str, db: Session = Depends(get_db)):
    if d1 == d2:
        raise HTTPException(status_code=400, detail="Pick two different drivers")
    data = _SeasonData(db, year)

    sides = []
    teams: dict[str, list[Constructor]] = {}
    for ref in (d1, d2):
        driver: Driver | None = get_driver_by_ref(db, ref)
        rows = (
            [r for race in data.raced for r in data.results[race.id] if r.driver_id == driver.id]
            if driver
            else []
        )
        if not rows:
            raise _not_entered("Driver", ref, year)
        # Every team the driver raced for that season, in the order they did.
        seen: dict[str, Constructor] = {}
        for r in rows:
            seen[r.constructor_id] = r.constructor
        teams[driver.id] = list(seen.values())
        did = driver.id
        sides.append(
            _Side(
                driver,
                member=lambda r, did=did: r.driver_id == did,
                is_fastest=lambda race, did=did: race.fastest_lap_driver_id == did,
            )
        )

    a, b = sides
    body = _compare(
        db,
        data,
        a,
        b,
        standings_model=DriverStanding,
        standings_key=DriverStanding.driver_id,
        per_car=False,
    )

    # Teammates: the rounds both drove for the same constructor.
    shared = [
        rnd
        for rnd in body["rounds"]
        if rnd["a"]["constructor"]
        and rnd["b"]["constructor"]
        and rnd["a"]["constructor"]["id"] == rnd["b"]["constructor"]["id"]
    ]

    def side_payload(side: _Side) -> dict:
        constructors = teams[side.entity.id]
        return {
            **driver_summary(side.entity),
            # The last team they raced for, which is where the colour comes from.
            "constructor": constructor_compact(constructors[-1]),
            "constructors": [constructor_compact(c) for c in constructors],
        }

    return {
        "type": "drivers",
        "a": side_payload(a),
        "b": side_payload(b),
        "teammates": {
            "sameTeam": bool(shared),
            "sharedRounds": len(shared),
            "constructor": shared[-1]["a"]["constructor"] if shared else None,
        },
        **body,
    }
