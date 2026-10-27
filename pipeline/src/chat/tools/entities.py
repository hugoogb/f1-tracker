"""Entity tools: a driver, a constructor (with its lineage) and a circuit.

Thin wrappers over the entity routers, trimmed to career totals and links.
"""

from __future__ import annotations

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from src.api.routers.circuits import get_circuit as _get_circuit
from src.api.routers.circuits import get_circuit_stats
from src.api.routers.constructors import get_constructor as _get_constructor
from src.api.routers.constructors import get_constructor_lineage
from src.api.routers.drivers import get_driver as _get_driver
from src.chat.tools.registry import Tool, register

LINEAGE_NOTE = "a lineage is a chain of entries, not one team; each member's record is its own"
CIRCUIT_WINNERS = 3


class RefArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ref: str


def _missing(kind: str, ref: str) -> dict:
    return {"error": f"no {kind} with ref '{ref}'; use the search tool to find the right ref"}


def career_of_driver(stats: dict) -> dict:
    return {
        "starts": stats["total_races"],
        "wins": stats["wins"],
        "podiums": stats["podiums"],
        "poles": stats["poles"],
        "fastestLaps": stats["fastest_laps"],
        "championships": stats["championships"],
        "points": stats["total_points"],
    }


def career_of_constructor(stats: dict) -> dict:
    return {
        "starts": stats["total_entries"],
        "wins": stats["wins"],
        "podiums": stats["podiums"],
        "points": stats["total_points"],
    }


def _driver_run(db: Session, args: RefArgs) -> dict:
    try:
        d = _get_driver(args.ref, db)
    except HTTPException:
        return _missing("driver", args.ref)
    return {
        "name": f"{d['firstName']} {d['lastName']}",
        "ref": d["ref"],
        "code": d["code"],
        "nationality": d["nationality"],
        "dateOfBirth": d["dateOfBirth"],
        "href": f"/drivers/{d['ref']}",
        "career": career_of_driver(d["stats"]),
    }


def _years(entry: dict) -> str:
    start, end = entry["yearFrom"], entry["yearTo"]
    return f"{start}-{end}" if end and end != start else str(start)


def _constructor_run(db: Session, args: RefArgs) -> dict:
    try:
        c = _get_constructor(args.ref, db)
        lineage = get_constructor_lineage(args.ref, db)
    except HTTPException:
        return _missing("constructor", args.ref)
    return {
        "name": c["name"],
        "ref": c["ref"],
        "nationality": c["nationality"],
        "href": f"/constructors/{c['ref']}",
        "career": career_of_constructor(c["stats"]),
        "lineage": [
            {
                "name": e["constructor"]["name"],
                "ref": e["constructor"]["ref"],
                "years": _years(e),
                "href": f"/constructors/{e['constructor']['ref']}",
            }
            for e in lineage["entries"]
        ],
        "note": LINEAGE_NOTE,
    }


def _circuit_run(db: Session, args: RefArgs) -> dict:
    try:
        c = _get_circuit(args.ref, db)
        stats = get_circuit_stats(args.ref, CIRCUIT_WINNERS, db)
    except HTTPException:
        return _missing("circuit", args.ref)
    years = [r["seasonYear"] for r in c["races"]]
    return {
        "name": c["name"],
        "ref": c["ref"],
        "location": c["location"],
        "country": c["country"],
        "href": f"/circuits/{c['ref']}",
        "races": len(years),
        "firstYear": min(years) if years else None,
        "lastYear": max(years) if years else None,
        "mostWins": [
            {
                "name": f"{w['driver']['firstName']} {w['driver']['lastName']}",
                "ref": w["driver"]["ref"],
                "wins": w["count"],
            }
            for w in stats["mostWins"]
        ],
    }


register(
    Tool(
        name="get_driver",
        description="A driver's profile and career totals: starts, wins, podiums, poles, "
        "fastest laps, championships and points. ref is the driver's ref from search.",
        args=RefArgs,
        run=_driver_run,
        label=lambda a: f"driver {a.ref}",
    )
)
register(
    Tool(
        name="get_constructor",
        description="A constructor's profile, career totals and the chain of renames it "
        "belongs to (lineage). ref is the constructor's ref from search.",
        args=RefArgs,
        run=_constructor_run,
        label=lambda a: f"constructor {a.ref}",
    )
)
register(
    Tool(
        name="get_circuit",
        description="A circuit's location, how many Grands Prix it has hosted, the first and "
        "last year, and its top winners. ref is the circuit's ref from search.",
        args=RefArgs,
        run=_circuit_run,
        label=lambda a: f"circuit {a.ref}",
    )
)
