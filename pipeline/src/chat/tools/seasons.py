"""Season tools: season, standings, progression, title permutations and calendar.

Thin wrappers over the season and standings routers, trimmed to what the model
needs to answer in a sentence. Every router argument is passed explicitly: a
FastAPI `Query` default is an object, not a value, when the function is called
directly.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.api.constants import FIRST_CONSTRUCTORS_CHAMPIONSHIP, MAX_PROGRESSION_TOP
from src.api.routers.seasons import get_season as _get_season
from src.api.routers.seasons import get_season_calendar as _get_calendar
from src.api.routers.standings import (
    constructor_standings,
    constructor_standings_progression,
    constructor_title_permutations,
    driver_standings,
    standings_progression,
    title_permutations,
)
from src.api.serializers import constructor_summary, driver_summary
from src.chat.constants import TOP_N
from src.chat.tools.registry import Tool, register
from src.db.models import Race, RaceResult, SprintResult
from src.db.queries import get_constructor_standings_for_season, get_driver_standings_for_season

Kind = Literal["drivers", "constructors"]

# Mirrors the season router: a difference this small is rounding, not a dropped score.
_DROPPED_EPSILON = 0.01

STANDINGS_NOTE = (
    "official championship table after that round; for drivers, `dropped` (when present) is "
    "what the best-N rule removed"
)
UNOFFICIAL_CONSTRUCTORS_NOTE = (
    "not an official championship table (constructors' championship began in "
    f"{FIRST_CONSTRUCTORS_CHAMPIONSHIP}); summed from results"
)


def _no_constructors_title(kind: str, year: int) -> bool:
    return kind == "constructors" and year < FIRST_CONSTRUCTORS_CHAMPIONSHIP


class YearArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    year: int


class YearKindArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    year: int
    kind: Kind


class StandingsArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    year: int
    kind: Kind
    focus_ref: str | None


def _driver_name(d: dict) -> str:
    return f"{d['firstName']} {d['lastName']}"


def _season_href(year: int) -> str:
    return f"/seasons/{year}"


def _race_href(year: int, rnd: int) -> str:
    return f"/seasons/{year}/races/{rnd}"


def _round_of(standings) -> dict | None:
    if not standings:
        return None
    race = standings[0].race
    return {
        "round": race.round,
        "name": race.name,
        "date": str(race.date) if race.date else None,
    }


def _entity(kind: str, row: dict) -> dict:
    """Name, ref and href of a standings row, whichever title it is for."""
    if kind == "drivers":
        d = row["driver"]
        return {"name": _driver_name(d), "ref": d["ref"], "href": f"/drivers/{d['ref']}"}
    c = row["constructor"]
    return {"name": c["name"], "ref": c["ref"], "href": f"/constructors/{c['ref']}"}


def _dropped(db: Session, year: int, rows: list[dict], up_to_round: int) -> dict[str, float]:
    """Points each shown driver scored but the official table did not count."""
    ids = [r["driver"]["id"] for r in rows]
    scored: dict[str, float] = {i: 0.0 for i in ids}
    for model in (RaceResult, SprintResult):
        found = db.execute(
            select(model.driver_id, func.sum(model.points))
            .join(Race, Race.id == model.race_id)
            .where(Race.season_year == year, Race.round <= up_to_round, model.driver_id.in_(ids))
            .group_by(model.driver_id)
        ).all()
        for driver_id, total in found:
            scored[driver_id] += float(total or 0)
    return {
        r["driver"]["ref"]: round(scored[r["driver"]["id"]] - r["points"], 2)
        for r in rows
        if scored[r["driver"]["id"]] - r["points"] > _DROPPED_EPSILON
    }


def _standings_run(db: Session, args: StandingsArgs) -> dict:
    drivers = args.kind == "drivers"
    payload = driver_standings(args.year, db) if drivers else constructor_standings(args.year, db)
    table = (
        get_driver_standings_for_season(db, args.year)
        if drivers
        else get_constructor_standings_for_season(db, args.year)
    )
    rows = payload["standings"]
    as_of = _round_of(table)
    if not rows or as_of is None:
        return {"error": f"no {args.kind} standings for {args.year}"}

    shown = rows[:TOP_N]
    if args.focus_ref and not any(_entity(args.kind, r)["ref"] == args.focus_ref for r in shown):
        shown += [r for r in rows[TOP_N:] if _entity(args.kind, r)["ref"] == args.focus_ref]
    dropped = _dropped(db, args.year, shown, as_of["round"]) if drivers else {}

    out_rows = []
    for r in shown:
        row = {"position": r["position"], **_entity(args.kind, r)}
        if drivers and r.get("constructor"):
            row["constructor"] = r["constructor"]["name"]
        row["points"] = r["points"]
        if row["ref"] in dropped:
            row["dropped"] = dropped[row["ref"]]
        row["wins"] = r["wins"]
        out_rows.append(row)
    return {
        "year": args.year,
        "kind": args.kind,
        "href": _season_href(args.year),
        "asOfRound": {**as_of, "href": _race_href(args.year, as_of["round"])},
        "note": UNOFFICIAL_CONSTRUCTORS_NOTE
        if _no_constructors_title(args.kind, args.year)
        else STANDINGS_NOTE,
        "standings": out_rows,
    }


def _today() -> str:
    return str(datetime.now(UTC).date())


def _champion(db: Session, year: int, races: list[dict], kind: str) -> dict | None:
    """The title winner, only once the last round has been run and is in the table.

    Right after the final race but before the next ingest the table is still the
    penultimate round's, and its leader is not yet the champion.
    """
    if _no_constructors_title(kind, year):
        return None
    last = races[-1] if races else None
    if last is None or last["date"] is None or last["date"] >= _today():
        return None
    drivers = kind == "drivers"
    table = (
        get_driver_standings_for_season(db, year)
        if drivers
        else get_constructor_standings_for_season(db, year)
    )
    as_of = _round_of(table)
    if as_of is None or as_of["round"] != last["round"]:
        return None
    # Read the leader off the table already in hand rather than through the
    # router, which would query the same standings a second time.
    top = next((s for s in table if s.position == 1), None)
    if top is None:
        return None
    if drivers:
        row = {"driver": driver_summary(top.driver)}
    else:
        row = {"constructor": constructor_summary(top.constructor)}
    e = _entity(kind, row)
    return {"name": e["name"], "ref": e["ref"], "href": e["href"]}


def _season_run(db: Session, args: YearArgs) -> dict:
    season = _get_season(args.year, db)
    races = season["races"]
    if not races:
        return {"error": f"no season {args.year}"}
    scoring = season["scoring"]
    system = scoring["system"]
    note = system["notes"] or ""
    dropped = scoring["droppedPoints"]
    if dropped and dropped["largest"]["driver"]:
        big = dropped["largest"]
        note = (
            f"{note} {_driver_name(big['driver'])} scored {big['scored']:g} but "
            f"{big['counted']:g} counted ({dropped['driversAffected']} drivers dropped points)."
        ).strip()
    today = _today()
    return {
        "year": args.year,
        "href": _season_href(args.year),
        "rounds": len(races),
        "completedRounds": sum(1 for r in races if r["date"] is not None and r["date"] < today),
        "champion": _champion(db, args.year, races, "drivers"),
        "constructorsChampion": _champion(db, args.year, races, "constructors"),
        "scoring": {
            "system": system["label"],
            "allResultsCounted": scoring["everyResultCounts"],
            "note": note,
        },
    }


def _progression_run(db: Session, args: YearKindArgs) -> dict:
    drivers = args.kind == "drivers"
    payload = (
        standings_progression(args.year, MAX_PROGRESSION_TOP, db)
        if drivers
        else constructor_standings_progression(args.year, MAX_PROGRESSION_TOP, db)
    )
    entities = payload["drivers"] if drivers else payload["constructors"]
    if not payload["rounds"] or not entities:
        return {"error": f"no {args.kind} progression for {args.year}"}
    names = {e["ref"]: _driver_name(e) if drivers else e["name"] for e in entities}
    leaders = []
    changes = 0
    previous = None
    for rnd in payload["rounds"]:
        ref = max(names, key=lambda k: rnd.get(k, 0.0))
        leaders.append(
            {"round": rnd["round"], "leader": names[ref], "ref": ref, "points": rnd.get(ref, 0.0)}
        )
        if previous is not None and ref != previous:
            changes += 1
        previous = ref
    return {
        "year": args.year,
        "kind": args.kind,
        "href": _season_href(args.year),
        "leaderAfterRound": leaders,
        "leadChanges": changes,
    }


def _needs(c: dict, p: dict) -> str:
    remaining = p["maxRemaining"]
    if p["decided"]:
        return "champion" if c["isLeader"] else "out of reach"
    if c["isLeader"]:
        clinch = "can clinch at the next round" if p["canClinchNextRound"] else "cannot clinch yet"
        return f"leads; secures it once the lead exceeds {remaining:g} points ({clinch})"
    text = f"{c['deficit']:g} points behind; must make that up from {remaining:g} available"
    if c["onlyOnCountback"]:
        text += ", and only by drawing level and winning the countback"
    return text


def _permutations_run(db: Session, args: YearKindArgs) -> dict:
    drivers = args.kind == "drivers"
    try:
        p = (
            title_permutations(args.year, db)
            if drivers
            else constructor_title_permutations(args.year, db)
        )
    except HTTPException as e:
        return {"error": str(e.detail)}
    contenders = []
    if p["started"]:
        alive = [c for c in p["contenders"] if c["alive"]][:TOP_N]
        for c in alive:
            e = _entity(args.kind, c)
            contenders.append(
                {
                    "name": e["name"],
                    "ref": e["ref"],
                    "points": c["points"],
                    "maxPoints": c["maxPossible"],
                    "needs": _needs(c, p),
                }
            )
    return {
        "year": args.year,
        "kind": args.kind,
        "href": _season_href(args.year),
        "decided": p["decided"],
        "roundsRemaining": p.get("racesRemaining", p["totalRounds"]),
        "contenders": contenders,
    }


def _calendar_run(db: Session, args: YearArgs) -> dict:
    try:
        cal = _get_calendar(args.year, db)
    except HTTPException:
        return {"error": f"no season {args.year}"}
    rounds = []
    for r in cal["rounds"]:
        w = r["winner"]
        rounds.append(
            {
                "round": r["round"],
                "name": r["name"],
                "circuit": r["circuit"]["name"],
                "country": r["circuit"]["country"],
                "date": r["date"],
                "winner": {"name": _driver_name(w["driver"]), "ref": w["driver"]["ref"]}
                if w
                else None,
                "href": _race_href(args.year, r["round"]),
            }
        )
    return {
        "year": args.year,
        "href": _season_href(args.year),
        "totalKm": cal["totalKm"],
        "rounds": rounds,
    }


register(
    Tool(
        name="get_season",
        description=(
            "One season: round count, how many have been run, the drivers' and constructors' "
            "champions (once decided) and how the year was scored."
        ),
        args=YearArgs,
        run=_season_run,
        label=lambda a: f"{a.year} season",
    )
)

register(
    Tool(
        name="get_standings",
        description=(
            "The official championship table after the latest round of a season: the top 10 "
            "plus focus_ref (a driver or constructor ref, or null) if outside the top 10. "
            "Use for 'who leads' and 'where did X finish'."
        ),
        args=StandingsArgs,
        run=_standings_run,
        label=lambda a: f"{a.year} standings",
    )
)

register(
    Tool(
        name="get_progression",
        description=(
            "Who led the championship after each round of a season and how many times the "
            "lead changed hands."
        ),
        args=YearKindArgs,
        run=_progression_run,
        label=lambda a: f"{a.year} progression",
    )
)

register(
    Tool(
        name="get_title_permutations",
        description=(
            "Who can still mathematically win a season's title, with each contender's points, "
            "maximum possible points and what they need. Constructors from 1958."
        ),
        args=YearKindArgs,
        run=_permutations_run,
        label=lambda a: f"{a.year} title permutations",
    )
)

register(
    Tool(
        name="get_calendar",
        description=(
            "Every round of a season with circuit, country, date and winner (null if not yet "
            "raced), plus total travel distance. Use for 'when is the next race'."
        ),
        args=YearArgs,
        run=_calendar_run,
        label=lambda a: f"{a.year} calendar",
    )
)
