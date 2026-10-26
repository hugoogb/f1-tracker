"""Every season ranked by how good a championship it was to watch.

Mounted at `/api/best-seasons` rather than under `/api/seasons/...`, so it can
never be swallowed by `/api/seasons/{year}`.

Two sources, kept apart:

* **Who won, and by how much**, comes from f1db's official final standings —
  never from summed race points. Until 1990 only part of a driver's record
  counted, and a sum of races crowns the wrong champion in those seasons (1988).
* **How the fight unfolded** — who led after each round, when the title was
  settled, who could still win it entering the finale — walks f1db's official
  table after every round, the same one `/standings/progression` draws. Before
  1991 that is points counted under the "best N results" rules, not points
  scored, so the lead is the real championship lead. The round at which the
  title was settled is f1db's own `drivers_title_decider` flag: under those
  rules a lead can be unassailable before the arithmetic on the visible totals
  says so, and the N changed from season to season. A season missing a round's
  table falls back to running totals of race and sprint points and is flagged
  `progressionApproximate`.

The composite score is a transparent weighted sum. Every component is a number
between 0 and 1 computed from one metric, its weight is in `COMPONENTS`, and the
response carries both, so the page can show exactly where a season's score
came from. It is an opinion about what makes a title fight good to watch, and
the page says so.
"""

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.api.serializers import constructor_compact, driver_summary
from src.db.database import get_db
from src.db.models import (
    Constructor,
    ConstructorStanding,
    Driver,
    DriverStanding,
    QualifyingResult,
    Race,
    RaceResult,
    SprintResult,
)
from src.db.queries import main_constructors, race_has_happened
from src.scoring import (
    FIRST_CONSTRUCTORS_SEASON,
    SYSTEMS,
    counts_every_result,
    era_bounds,
    max_points_remaining,
    still_in_contention,
    system_for_year,
    wins_countback,
)

router = APIRouter()

# --- The score -----------------------------------------------------------------
#
# (id, label, weight, description). Weights sum to 100, so a component's points
# are `weight * value` and the total is already on a 0-100 scale.
COMPONENTS: tuple[tuple[str, str, int, str], ...] = (
    (
        "closeness",
        "Title margin",
        30,
        "How close the champion and runner-up finished in the official standings, as a share "
        "of the champion's total so a 9-points-a-win era and a 25-points-a-win era compare. "
        "Level on points scores 1; a margin of 40% of the champion's total or more scores 0.",
    ),
    (
        "lateness",
        "Decided late",
        25,
        "How late the title was mathematically settled. Settled at the final round scores 1; "
        "settled with half the season or more still to run scores 0.",
    ),
    (
        "contention",
        "Finale contenders",
        15,
        "How many drivers could still mathematically win it entering the final round. One "
        "(already settled) scores 0, two score 0.5, three or more score 1.",
    ),
    (
        "variety",
        "Different winners",
        15,
        "How many different drivers won a race. One winner scores 0; eight or more — or a "
        "different winner at every race of a shorter season — scores 1.",
    ),
    (
        "leadChanges",
        "Lead changes",
        15,
        "How many times the championship lead changed hands from one round to the next. Four "
        "or more scores 1.",
    ),
)

# A margin this large a share of the champion's total scores nothing for closeness.
MARGIN_SHARE_CEILING = 0.4
# Different winners needed for full marks, unless the season had fewer races.
WINNERS_FOR_FULL_MARKS = 8
# Lead changes needed for full marks.
LEAD_CHANGES_FOR_FULL_MARKS = 4
# The constructors' championship was first awarded in 1958 (FIRST_CONSTRUCTORS_SEASON).
# The database can hold constructor tables for earlier seasons (the ingest
# totals them where f1db has none), but there was no title to win, so they are
# not shown as one.

NOTES = (
    "The champion, the runner-up and the title margin come from the official final "
    "standings, never from a sum of race points.",
    "The lead and the finale contenders follow the official championship table after each "
    "round — the one the season page's championship progression draws. From 1950 to 1990 "
    "only part of a driver's results counted, under a best-results rule whose details "
    "changed from season to season, and that table already applies it.",
    "The round at which the title was settled is the one the official record marks as the "
    "decider. Where it has none, a title counts as settled once nobody could catch the "
    "leader even if the leader never scored again — the strict test the title permutations "
    "use.",
    "Finale contenders are the drivers who could still have caught the leader on the official "
    "table entering the last round. Before 1991 a result in that round could also have been "
    "one a driver had to drop, so for those seasons the count is an upper bound — it never "
    "leaves out a driver who was in the fight.",
    "The Indianapolis 500 counted towards the championship from 1950 to 1960, and its "
    "winners count among those seasons' different winners.",
    "The constructors' championship began in 1958, so earlier seasons have no constructors' "
    "margin. It is shown but not scored, so every season is scored on the same basis.",
)

SortKey = Literal[
    "score",
    "year",
    "title_margin",
    "margin_share",
    "decided_rounds_from_end",
    "contenders_at_finale",
    "distinct_winners",
    "distinct_pole_sitters",
    "lead_changes",
    "constructors_margin",
]

Standing = tuple[str, float, int | None]  # (id, points, position)


@dataclass
class _Season:
    year: int
    races: list[Race] = field(default_factory=list)
    # race_id -> {driver_id: race + sprint points that round}; a key per round run.
    round_points: dict[str, dict[str, float]] = field(default_factory=dict)
    # race_id -> {driver_id: (official points, position)} as the table stood after it.
    official_tables: dict[str, dict[str, tuple[float, int | None]]] = field(default_factory=dict)
    driver_final: list[Standing] = field(default_factory=list)
    constructor_final: list[Standing] = field(default_factory=list)
    # Grand Prix finishing positions per round, for the countback on a tie.
    round_positions: dict[str, dict[str, int]] = field(default_factory=dict)
    winners: set[str] = field(default_factory=set)
    pole_sitters: set[str] = field(default_factory=set)
    poles_known: int = 0


def _clamp(value: float) -> float:
    return max(0.0, min(1.0, value))


def _ranked(rows: list[Standing]) -> list[Standing]:
    """Standings order: official position first, points as the tie-breaker."""
    return sorted(rows, key=lambda r: (r[2] if r[2] is not None else 10_000, -r[1], r[0]))


def _final_standings(
    rows: list, race_year: dict[str, int], race_round: dict[str, int]
) -> dict[int, list[Standing]]:
    """Each season's standings at the latest round that has any: the official final table."""
    by_race: dict[str, list[Standing]] = defaultdict(list)
    for race_id, entity_id, points, position in rows:
        by_race[race_id].append((entity_id, float(points or 0), position))
    latest: dict[int, str] = {}
    for race_id in by_race:
        year = race_year[race_id]
        if year not in latest or race_round[race_id] > race_round[latest[year]]:
            latest[year] = race_id
    return {year: _ranked(by_race[race_id]) for year, race_id in latest.items()}


def _load(db: Session) -> dict[int, _Season]:
    """Every season's calendar, points per round, final tables, winners and poles."""
    seasons: dict[int, _Season] = {}
    race_year: dict[str, int] = {}
    race_round: dict[str, int] = {}
    for race in db.execute(select(Race).order_by(Race.season_year, Race.round)).scalars():
        seasons.setdefault(race.season_year, _Season(race.season_year)).races.append(race)
        race_year[race.id] = race.season_year
        race_round[race.id] = race.round
    if not seasons:
        return seasons

    for race_id, driver_id, points, position in db.execute(
        select(RaceResult.race_id, RaceResult.driver_id, RaceResult.points, RaceResult.position)
    ).all():
        season = seasons[race_year[race_id]]
        scored = season.round_points.setdefault(race_id, {})
        scored[driver_id] = scored.get(driver_id, 0.0) + float(points or 0)
        if position == 1:
            season.winners.add(driver_id)
        if position is not None and position > 0:
            season.round_positions.setdefault(race_id, {})[driver_id] = position

    for race_id, driver_id, points in db.execute(
        select(SprintResult.race_id, SprintResult.driver_id, SprintResult.points)
    ).all():
        scored = seasons[race_year[race_id]].round_points.setdefault(race_id, {})
        scored[driver_id] = scored.get(driver_id, 0.0) + float(points or 0)

    driver_rows = db.execute(
        select(
            DriverStanding.race_id,
            DriverStanding.driver_id,
            DriverStanding.points,
            DriverStanding.position,
        )
    ).all()
    for race_id, driver_id, points, position in driver_rows:
        seasons[race_year[race_id]].official_tables.setdefault(race_id, {})[driver_id] = (
            float(points or 0),
            position,
        )
    drivers = _final_standings(driver_rows, race_year, race_round)
    constructors = _final_standings(
        db.execute(
            select(
                ConstructorStanding.race_id,
                ConstructorStanding.constructor_id,
                ConstructorStanding.points,
                ConstructorStanding.position,
            )
        ).all(),
        race_year,
        race_round,
    )
    for year, season in seasons.items():
        season.driver_final = drivers.get(year, [])
        season.constructor_final = constructors.get(year, [])

    pole_races: dict[int, set[str]] = defaultdict(set)
    for race_id, driver_id in db.execute(
        select(QualifyingResult.race_id, QualifyingResult.driver_id).where(
            QualifyingResult.position == 1
        )
    ).all():
        year = race_year[race_id]
        seasons[year].pole_sitters.add(driver_id)
        pole_races[year].add(race_id)
    for year, ids in pole_races.items():
        seasons[year].poles_known = len(ids)

    return seasons


def _sprint_race_ids(db: Session, seasons: dict[int, _Season]) -> set[str]:
    """Rounds that had a sprint: from the results where run, the schedule where not."""
    ids = set(db.execute(select(SprintResult.race_id).distinct()).scalars().all())
    for season in seasons.values():
        ids.update(r.id for r in season.races if r.sprint_race_at is not None)
    return ids


def _leader(totals: dict[str, float], previous: str | None) -> str:
    """Who led on points. A tie at the top does not take the lead off its holder."""
    best = max(totals.values())
    tied = sorted(d for d, p in totals.items() if p == best)
    return previous if previous in tied else tied[0]


def _official_leader(table: dict[str, tuple[float, int | None]], previous: str | None) -> str:
    """The official P1, which already applies the countback on a tie on points."""
    leaders = sorted(d for d, (_, position) in table.items() if position == 1)
    if leaders:
        return previous if previous in leaders else leaders[0]
    return _leader({d: p for d, (p, _) in table.items()}, previous)


def _analyse(season: _Season, sprint_ids: set[str], today: date) -> dict | None:
    run = [r for r in season.races if r.id in season.round_points]
    if not run or not season.driver_final:
        return None

    year = season.year
    system = system_for_year(year)
    total_rounds = len(season.races)
    in_progress = any(not race_has_happened(r, today) for r in season.races) or (
        run[-1].id != season.races[-1].id
    )

    champion = season.driver_final[0]
    runner_up = season.driver_final[1] if len(season.driver_final) > 1 else None

    # Walk the season round by round on the official table (see the module
    # note), or on running totals of points scored where a round has none. The
    # title is settled at the round f1db flags as the decider; without a flag,
    # at the first round after which nobody could catch the leader, and that
    # leader has to be the official champion.
    official = all(r.id in season.official_tables for r in run)
    flagged = next((r for r in run if r.drivers_title_decider), None)
    decided_at: Race | None = None
    contenders_at_finale: int | None = None
    leaders: list[str] = []
    totals: dict[str, float] = defaultdict(float)
    finishes: dict[str, list[int]] = defaultdict(list)
    for index, race in enumerate(run):
        for driver_id, position in season.round_positions.get(race.id, {}).items():
            counts = finishes[driver_id]
            counts.extend([0] * (position - len(counts)))
            counts[position - 1] += 1
        if official:
            table = season.official_tables[race.id]
            totals.update({d: p for d, (p, _) in table.items()})
        else:
            for driver_id, points in season.round_points[race.id].items():
                totals[driver_id] += points
        if not any(totals.values()):
            continue
        last_round = index == len(run) - 1
        previous = leaders[-1] if leaders else None
        if last_round and not in_progress:
            leader_id = champion[0]
        elif official:
            leader_id = _official_leader(table, previous)
        else:
            leader_id = _leader(totals, previous)
        later = season.races[season.races.index(race) + 1 :]
        remaining = max_points_remaining(
            system, len(later), sum(1 for r in later if r.id in sprint_ids), year
        )
        leader_points = totals[leader_id]
        alive = 1 + sum(
            1
            for d, points in totals.items()
            if d != leader_id
            and still_in_contention(
                points,
                leader_points,
                remaining,
                countback=wins_countback(finishes[d], finishes[leader_id], len(later)),
            )
        )
        if not in_progress:
            if decided_at is None and leader_id == champion[0] and alive == 1:
                decided_at = race
            if len(later) == 1:
                contenders_at_finale = alive
        leaders.append(leader_id)
    if not in_progress and flagged is not None:
        decided_at = flagged
        # Settled before the finale: whatever the visible totals allowed, the
        # official record says nobody could still win it.
        if flagged.round < run[-1].round and contenders_at_finale is not None:
            contenders_at_finale = 1
    if not in_progress and decided_at is None:
        decided_at = run[-1]

    lead_changes = sum(1 for a, b in zip(leaders, leaders[1:], strict=False) if a != b)

    margin = champion[1] - runner_up[1] if runner_up else None
    margin_share = (margin / champion[1]) if margin is not None and champion[1] > 0 else None
    rounds_from_end = (
        sum(1 for r in season.races if r.round > decided_at.round) if decided_at else None
    )

    constructors = None
    if year >= FIRST_CONSTRUCTORS_SEASON and len(season.constructor_final) >= 2:
        c_champ, c_second = season.constructor_final[0], season.constructor_final[1]
        c_margin = c_champ[1] - c_second[1]
        constructors = {
            "championId": c_champ[0],
            "runnerUpId": c_second[0],
            "championPoints": c_champ[1],
            "runnerUpPoints": c_second[1],
            "margin": round(c_margin, 2),
            "marginShare": round(c_margin / c_champ[1], 4) if c_champ[1] > 0 else None,
        }

    # --- components ---------------------------------------------------------
    values: dict[str, float] = {
        "closeness": _clamp(1 - margin_share / MARGIN_SHARE_CEILING)
        if margin_share is not None
        else 0.0,
        "lateness": _clamp(1 - rounds_from_end / (total_rounds / 2))
        if rounds_from_end is not None and total_rounds
        else 0.0,
        "contention": _clamp((contenders_at_finale - 1) / 2)
        if contenders_at_finale is not None
        else 0.0,
        "variety": _clamp(
            (len(season.winners) - 1) / max(min(WINNERS_FOR_FULL_MARKS, len(run)) - 1, 1)
        ),
        "leadChanges": _clamp(lead_changes / LEAD_CHANGES_FOR_FULL_MARKS),
    }
    components = [
        {
            "id": cid,
            "label": label,
            "weight": weight,
            "value": round(values[cid], 4),
            "points": round(values[cid] * weight, 2),
        }
        for cid, label, weight, _ in COMPONENTS
    ]

    return {
        "year": year,
        "inProgress": in_progress,
        "totalRounds": total_rounds,
        "roundsRun": len(run),
        "pointsSystem": {"id": system.id, "label": system.label, "era": system.era},
        "everyResultCounts": counts_every_result(year),
        # Only where a round had no official table and points scored stood in.
        "progressionApproximate": not official and not counts_every_result(year),
        "_champion": champion,
        "_runnerUp": runner_up,
        "titleMargin": round(margin, 2) if margin is not None else None,
        "titleMarginShare": round(margin_share, 4) if margin_share is not None else None,
        "titleMarginInWins": round(margin / system.win_points, 2) if margin is not None else None,
        "decidedAtRound": decided_at.round if decided_at else None,
        "decidedAtRace": decided_at.name if decided_at else None,
        "decidedRoundsFromEnd": rounds_from_end,
        "wentToFinalRound": rounds_from_end == 0 if rounds_from_end is not None else None,
        "contendersAtFinale": contenders_at_finale,
        "distinctWinners": len(season.winners),
        "distinctPoleSitters": len(season.pole_sitters) if season.poles_known else None,
        "polesKnown": season.poles_known,
        "leadChanges": lead_changes,
        "distinctLeaders": len(set(leaders)),
        "_constructors": constructors,
        "score": {
            "total": round(sum(c["points"] for c in components), 1),
            "components": components,
        },
    }


def _build(
    db: Session, year_from: int | None, year_to: int | None, include_in_progress: bool
) -> list[dict]:
    """Every season in range, analysed and ranked on score across all completed seasons."""
    # Ranks are site-wide, so they are computed over every season, then filtered.
    seasons = _load(db)
    sprint_ids = _sprint_race_ids(db, seasons) if seasons else set()
    today = date.today()
    entries = [e for s in seasons.values() if (e := _analyse(s, sprint_ids, today))]

    completed = sorted(
        (e for e in entries if not e["inProgress"]),
        key=lambda e: (-e["score"]["total"], -e["year"]),
    )
    for rank, entry in enumerate(completed, start=1):
        entry["rank"] = rank
    for entry in entries:
        entry.setdefault("rank", None)

    entries = [
        e
        for e in entries
        if (include_in_progress or not e["inProgress"])
        and (year_from is None or e["year"] >= year_from)
        and (year_to is None or e["year"] <= year_to)
    ]

    pairs: set[tuple[int, str]] = set()
    driver_ids: set[str] = set()
    constructor_ids: set[str] = set()
    for e in entries:
        for key in ("_champion", "_runnerUp"):
            if e[key]:
                pairs.add((e["year"], e[key][0]))
                driver_ids.add(e[key][0])
        if e["_constructors"]:
            constructor_ids.update(
                {e["_constructors"]["championId"], e["_constructors"]["runnerUpId"]}
            )

    drivers = (
        {d.id: d for d in db.execute(select(Driver).where(Driver.id.in_(driver_ids))).scalars()}
        if driver_ids
        else {}
    )
    constructors = (
        {
            c.id: c
            for c in db.execute(
                select(Constructor).where(Constructor.id.in_(constructor_ids))
            ).scalars()
        }
        if constructor_ids
        else {}
    )
    teams = main_constructors(db, pairs)

    def contender(year: int, row: tuple[str, float, int | None] | None) -> dict | None:
        if row is None or row[0] not in drivers:
            return None
        team = teams.get((year, row[0]))
        return {
            "driver": driver_summary(drivers[row[0]]),
            "constructor": constructor_compact(team) if team else None,
            "points": row[1],
        }

    out = []
    for e in entries:
        c = e.pop("_constructors")
        champion, runner_up = e.pop("_champion"), e.pop("_runnerUp")
        e["champion"] = contender(e["year"], champion)
        e["runnerUp"] = contender(e["year"], runner_up)
        e["constructors"] = (
            {
                "champion": constructor_compact(constructors[c["championId"]])
                if c["championId"] in constructors
                else None,
                "runnerUp": constructor_compact(constructors[c["runnerUpId"]])
                if c["runnerUpId"] in constructors
                else None,
                "championPoints": c["championPoints"],
                "runnerUpPoints": c["runnerUpPoints"],
                "margin": c["margin"],
                "marginShare": c["marginShare"],
            }
            if c
            else None
        )
        out.append(e)
    return out


_SORT_VALUE = {
    "score": lambda e: e["score"]["total"],
    "year": lambda e: e["year"],
    "title_margin": lambda e: e["titleMargin"],
    "margin_share": lambda e: e["titleMarginShare"],
    "decided_rounds_from_end": lambda e: e["decidedRoundsFromEnd"],
    "contenders_at_finale": lambda e: e["contendersAtFinale"],
    "distinct_winners": lambda e: e["distinctWinners"],
    "distinct_pole_sitters": lambda e: e["distinctPoleSitters"],
    "lead_changes": lambda e: e["leadChanges"],
    "constructors_margin": lambda e: e["constructors"]["margin"] if e["constructors"] else None,
}


def _components_payload() -> list[dict]:
    return [
        {"id": cid, "label": label, "weight": weight, "description": description}
        for cid, label, weight, description in COMPONENTS
    ]


@router.get("/best-seasons")
def best_seasons(
    sort: SortKey = Query("score", description="Metric to order by"),
    order: Literal["asc", "desc"] = Query("desc"),
    era: str | None = Query(
        None,
        description=(
            "A points-system id from /api/points-systems, used as a shorthand for the seasons "
            "it was in force. Mutually exclusive with year_from/year_to."
        ),
    ),
    year_from: int | None = Query(None, ge=1950, description="First season, inclusive"),
    year_to: int | None = Query(None, ge=1950, description="Last season, inclusive"),
    include_in_progress: bool = Query(
        False, description="Also return the running season, flagged inProgress and unranked"
    ),
    db: Session = Depends(get_db),
):
    """Every completed season, with the metrics behind a title fight and a 0-100 score.

    `rank` is the season's place by score among every completed season, whatever
    the filter, so a season keeps one rank across the site.
    """
    era_system = None
    if era is not None:
        if year_from is not None or year_to is not None:
            raise HTTPException(
                status_code=400,
                detail="Pass either era or a year_from/year_to range, not both.",
            )
        era_system = SYSTEMS.get(era)
        if era_system is None:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown era '{era}'. The ids come from /api/points-systems.",
            )
        year_from, year_to = era_bounds(era_system.id)
    if year_from is not None and year_to is not None and year_from > year_to:
        raise HTTPException(status_code=400, detail="year_from must not be later than year_to.")

    entries = _build(db, year_from, year_to, include_in_progress)

    value = _SORT_VALUE[sort]
    present = [e for e in entries if value(e) is not None]
    missing = [e for e in entries if value(e) is None]
    present.sort(key=lambda e: e["year"], reverse=True)
    present.sort(key=value, reverse=order == "desc")

    return {
        "sort": sort,
        "order": order,
        "era": (
            {"id": era_system.id, "label": era_system.label, "era": era_system.era}
            if era_system
            else None
        ),
        "yearFrom": year_from,
        "yearTo": year_to,
        "total": len(entries),
        "components": _components_payload(),
        "notes": list(NOTES),
        # Seasons with no value for the sort metric go last, whatever the order.
        "seasons": present + missing,
    }


@router.get("/best-seasons/{year}")
def best_season(year: int, db: Session = Depends(get_db)):
    """One season's entry and where it ranks, for the season page."""
    entries = _build(db, None, None, include_in_progress=True)
    entry = next((e for e in entries if e["year"] == year), None)
    if entry is None:
        raise HTTPException(status_code=404, detail="Season not ranked")
    return {
        "rankedSeasons": sum(1 for e in entries if e["rank"] is not None),
        "components": _components_payload(),
        "season": entry,
    }
