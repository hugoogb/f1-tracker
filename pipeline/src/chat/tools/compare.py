"""Comparison tools: two drivers or two constructors, all-time or within one season.

Thin wrappers over the compare routers, with the page link that shows the same view.
"""

from __future__ import annotations

from typing import Literal

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from src.api.routers.compare import compare_constructors as _compare_constructors
from src.api.routers.compare import compare_drivers as _compare_drivers
from src.api.routers.season_compare import season_compare_constructors, season_compare_drivers
from src.chat.tools.entities import career_of_constructor, career_of_driver
from src.chat.tools.registry import Tool, register

SEASON_NOTE = (
    "points are the official championship totals (not summed race points); every delta is "
    "A minus B, so positive favours A for counts and points"
)


class PairArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    a: str
    b: str


class SeasonPairArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    year: int
    kind: Literal["drivers", "constructors"]
    a: str
    b: str


def _side(entity: dict, kind: str) -> dict:
    name = f"{entity['firstName']} {entity['lastName']}" if kind == "drivers" else entity["name"]
    return {"name": name, "ref": entity["ref"], "href": f"/{kind}/{entity['ref']}"}


def _same(args: PairArgs, kind: str) -> dict | None:
    if args.a == args.b:
        return {"error": f"pick two different {kind}; both refs are '{args.a}'"}
    return None


def _drivers_run(db: Session, args: PairArgs) -> dict:
    if (err := _same(args, "drivers")) is not None:
        return err
    try:
        c = _compare_drivers(args.a, args.b, False, db)
    except HTTPException as e:
        return {"error": str(e.detail)}
    h, q = c["headToHead"], c["qualifyingHeadToHead"]
    return {
        "a": _side(c["driver1"], "drivers"),
        "b": _side(c["driver2"], "drivers"),
        "href": f"/compare/drivers?d1={args.a}&d2={args.b}",
        "careers": {
            "a": career_of_driver(c["driver1"]["stats"]),
            "b": career_of_driver(c["driver2"]["stats"]),
        },
        "headToHead": {
            "race": {"a": h["driver1Wins"], "b": h["driver2Wins"], "total": h["totalRaces"]},
            "qualifying": {"a": q["driver1Wins"], "b": q["driver2Wins"], "total": q["totalRaces"]},
        },
        "teammateSeasons": c["teammateSeasons"],
    }


def _constructors_run(db: Session, args: PairArgs) -> dict:
    if (err := _same(args, "constructors")) is not None:
        return err
    try:
        c = _compare_constructors(args.a, args.b, db)
    except HTTPException as e:
        return {"error": str(e.detail)}
    h = c["headToHead"]
    return {
        "a": _side(c["constructor1"], "constructors"),
        "b": _side(c["constructor2"], "constructors"),
        "href": f"/compare/constructors?c1={args.a}&c2={args.b}",
        "careers": {
            "a": career_of_constructor(c["constructor1"]["stats"]),
            "b": career_of_constructor(c["constructor2"]["stats"]),
        },
        "headToHead": {
            "race": {
                "a": h["constructor1Wins"],
                "b": h["constructor2Wins"],
                "total": h["totalRaces"],
            }
        },
    }


def _in_season_run(db: Session, args: SeasonPairArgs) -> dict:
    try:
        c = (
            season_compare_drivers(args.year, args.a, args.b, db)
            if args.kind == "drivers"
            else season_compare_constructors(args.year, args.a, args.b, db)
        )
    except HTTPException as e:
        return {"error": str(e.detail)}
    agg = c["aggregates"]
    return {
        "year": args.year,
        "kind": args.kind,
        "href": f"/seasons/{args.year}/compare?type={args.kind}&a={args.a}&b={args.b}",
        "a": _side(c["a"], args.kind),
        "b": _side(c["b"], args.kind),
        "season": {
            "points": c["points"]["championship"],
            "wins": agg["wins"],
            "podiums": agg["podiums"],
            "poles": agg["poles"],
            "headToHead": c["headToHead"],
        },
        "note": SEASON_NOTE,
    }


register(
    Tool(
        name="compare_drivers",
        description="Two drivers' careers side by side with race and qualifying head-to-head. "
        "a and b are driver refs from search; they must differ.",
        args=PairArgs,
        run=_drivers_run,
        label=lambda a: f"compare {a.a} vs {a.b}",
    )
)
register(
    Tool(
        name="compare_constructors",
        description="Two constructors' careers side by side with a race head-to-head. "
        "a and b are constructor refs from search; they must differ.",
        args=PairArgs,
        run=_constructors_run,
        label=lambda a: f"compare {a.a} vs {a.b}",
    )
)
register(
    Tool(
        name="compare_in_season",
        description="Two drivers or two constructors within one season: official championship "
        "points, wins, podiums, poles and head-to-heads, each with A minus B deltas.",
        args=SeasonPairArgs,
        run=_in_season_run,
        label=lambda a: f"{a.year} compare",
    )
)
