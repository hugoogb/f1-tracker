"""Race tool: one weekend's results, qualifying, sprint or pit stops, trimmed to the top ten.

Thin wrapper over the races router. Every router argument is passed explicitly.
"""

from __future__ import annotations

from typing import Literal

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from src.api.routers.races import get_pitstops, get_qualifying, get_race, get_sprint
from src.chat.constants import TOP_N
from src.chat.tools.registry import Tool, register

Section = Literal["results", "qualifying", "sprint", "pitstops"]

PITSTOP_NOTE = (
    "timeLost is each stop's pit-lane time against the quickest stop of the same race "
    "(`benchmark`); the pit-lane time is dominated by the circuit, so compare within one race"
)


class RaceArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    year: int
    round: int
    section: Section


def _name(d: dict) -> str:
    return f"{d['firstName']} {d['lastName']}"


def _who(row: dict) -> dict:
    return {
        "name": _name(row["driver"]),
        "ref": row["driver"]["ref"],
        "constructor": row["constructor"]["name"] if row.get("constructor") else None,
    }


def _classified(rows: list[dict]) -> list[dict]:
    return [
        {
            "position": r["position"] if r["position"] is not None else r["positionText"],
            **_who(r),
            "grid": r["grid"],
            "points": r["points"],
            "status": r["status"],
            "time": r["time"],
        }
        for r in rows[:TOP_N]
    ]


def _qualifying(rows: list[dict]) -> list[dict]:
    return [
        {"position": r["position"], **_who(r), "q1": r["q1"], "q2": r["q2"], "q3": r["q3"]}
        for r in rows[:TOP_N]
    ]


def _pitstops(payload: dict) -> tuple[list[dict], dict]:
    stops = [s for s in payload["pitStops"] if s["timeLost"] is not None]
    quickest = sorted(stops, key=lambda s: float(s["timeLost"]))[:TOP_N]
    rows = [
        {
            **_who(s),
            "stop": s["stopNumber"],
            "lap": s["lap"],
            "duration": s["duration"],
            "timeLost": s["timeLost"],
        }
        for s in quickest
    ]
    return rows, {
        "shown": len(rows),
        "total": len(payload["pitStops"]),
        "order": "quickest first",
        "benchmark": payload["benchmark"],
    }


def _run(db: Session, args: RaceArgs) -> dict:
    y, r = args.year, args.round
    try:
        race = get_race(y, r, db)
        if args.section == "results":
            rows, extra = _classified(race["results"]), {"total": len(race["results"])}
        elif args.section == "qualifying":
            q = get_qualifying(y, r, db)["results"]
            rows, extra = _qualifying(q), {"total": len(q)}
        elif args.section == "sprint":
            s = get_sprint(y, r, db)["results"]
            rows, extra = _classified(s), {"total": len(s)}
        else:
            rows, extra = _pitstops(get_pitstops(y, r, db))
    except HTTPException as e:
        return {"error": f"no race for {y} round {r}" if e.status_code == 404 else str(e.detail)}
    if not rows:
        return {"error": f"no {args.section} data for {y} round {r}"}

    circuit = race["circuit"]
    out: dict = {
        "year": y,
        "round": r,
        "name": race["name"],
        "date": race["date"],
        "circuit": {
            "name": circuit["name"],
            "country": circuit["country"],
            "href": f"/circuits/{circuit['ref']}",
        },
        "href": f"/seasons/{y}/races/{r}",
        "section": args.section,
    }
    fastest = race["fastestLap"]
    if args.section == "results" and fastest:
        out["fastestLap"] = {
            "name": _name(fastest["driver"]),
            "ref": fastest["driver"]["ref"],
            "time": fastest["time"],
            "lap": fastest["lapNumber"],
        }
    if args.section == "pitstops":
        out["note"] = PITSTOP_NOTE
    out["coverage"] = extra
    out["rows"] = rows
    return out


register(
    Tool(
        name="get_race",
        description=(
            "One race weekend section: results (top 10 with grid, points, status), qualifying "
            "(top 10 with Q1-Q3), sprint, or pitstops (quickest 10 stops, with time lost against "
            "the race's quickest stop). Includes the race page link."
        ),
        args=RaceArgs,
        run=_run,
        label=lambda a: f"{a.year} round {a.round} {a.section}",
    )
)
