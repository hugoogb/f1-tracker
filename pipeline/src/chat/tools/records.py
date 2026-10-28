"""Records tools: all-time rankings, season champions and the best-seasons ranking.

Thin wrappers over the records, champions and best-seasons routers. Every router
argument is passed explicitly: a FastAPI `Query` default is an object, not a value,
when the function is called directly.
"""

from __future__ import annotations

from typing import Literal

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from src.api.constants import FIRST_CONSTRUCTORS_CHAMPIONSHIP
from src.api.routers.best_seasons import best_seasons
from src.api.routers.champions import list_champions
from src.api.routers.records import explore_records
from src.chat.tools.registry import Tool, register

Category = Literal[
    "wins",
    "poles",
    "podiums",
    "fastest_laps",
    "starts",
    "championships",
    "points",
    "win_rate",
    "podium_rate",
]

MAX_RECORDS = 25
MAX_BEST_SEASONS = 10
MAX_CHAMPION_SEASONS = 25


class RecordsArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    entity: Literal["driver", "constructor"]
    category: Category
    year_from: int | None
    year_to: int | None
    nationality: str | None
    min_starts: int | None
    limit: int


class ChampionsArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    year_from: int | None
    year_to: int | None
    limit: int | None = None
    oldest_first: bool = False


class BestSeasonsArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    limit: int


def _name(d: dict) -> str:
    return f"{d['firstName']} {d['lastName']}"


def _records_run(db: Session, args: RecordsArgs) -> dict:
    drivers = args.entity == "driver"
    limit = max(1, min(args.limit, MAX_RECORDS))
    try:
        out = explore_records(
            entity=args.entity,
            category=args.category,
            era=None,
            year_from=args.year_from,
            year_to=args.year_to,
            nationality=args.nationality if drivers else None,
            country=None if drivers else args.nationality,
            min_starts=args.min_starts,
            sort="desc",
            page=1,
            limit=limit,
            db=db,
        )
    except HTTPException as e:
        return {"error": str(e.detail)}
    rows = []
    for r in out["data"]:
        who = r["driver"] if drivers else r["constructor"]
        rows.append(
            {
                "rank": r["rank"],
                "name": _name(who) if drivers else who["name"],
                "ref": who["ref"],
                "value": r["value"],
                "starts": r["starts"],
                "href": f"/{'drivers' if drivers else 'constructors'}/{who['ref']}",
            }
        )
    return {
        "entity": args.entity,
        "category": args.category,
        "label": out["label"],
        "yearFrom": out["yearFrom"],
        "yearTo": out["yearTo"],
        "nationality": out["nationality"],
        "minStarts": out["minStarts"],
        "href": "/records",
        "note": out["note"],
        "rows": rows,
    }


def _champions_run(db: Session, args: ChampionsArgs) -> dict:
    seasons = [
        s
        for s in list_champions(db)["data"]
        if (args.year_from is None or s["year"] >= args.year_from)
        and (args.year_to is None or s["year"] <= args.year_to)
    ]
    if args.oldest_first:
        seasons.reverse()  # the router lists newest first
    wanted = MAX_CHAMPION_SEASONS if args.limit is None else args.limit
    limit = max(1, min(wanted, MAX_CHAMPION_SEASONS))
    shown = seasons[:limit]
    out = []
    for s in shown:
        d, team, con = s["driver"], s["driverConstructor"], s["constructor"]
        out.append(
            {
                "year": s["year"],
                # The drivers' champion and the car they raced; the constructors'
                # champion is a separate field and need not be the same team.
                "driver": {
                    "name": _name(d),
                    "ref": d["ref"],
                    "constructor": team["name"] if team else None,
                }
                if d
                else None,
                # No constructors' title was awarded before 1958; the table the
                # ingest summed for those years has a leader, not a champion.
                "constructor": {"name": con["name"], "ref": con["ref"]}
                if con and s["year"] >= FIRST_CONSTRUCTORS_CHAMPIONSHIP
                else None,
                "href": f"/seasons/{s['year']}",
            }
        )
    result: dict = {"href": "/champions", "total": len(seasons), "seasons": out}
    if len(seasons) > len(shown):
        end = "oldest" if args.oldest_first else "newest"
        result["note"] = (
            f"{end} {len(shown)} of {len(seasons)} seasons; for the rest, move the year range "
            "on or set oldest_first"
        )
    return result


def _best_seasons_run(db: Session, args: BestSeasonsArgs) -> dict:
    limit = max(1, min(args.limit, MAX_BEST_SEASONS))
    payload = best_seasons(
        sort="score",
        order="desc",
        era=None,
        year_from=None,
        year_to=None,
        include_in_progress=False,
        db=db,
    )
    seasons = []
    for s in payload["seasons"][:limit]:
        champ = s["champion"]
        seasons.append(
            {
                "rank": s["rank"],
                "year": s["year"],
                "score": s["score"]["total"],
                "champion": _name(champ["driver"]) if champ else None,
                "margin": s["titleMargin"],
                "href": f"/seasons/{s['year']}",
            }
        )
    return {"href": "/best-seasons", "seasons": seasons}


register(
    Tool(
        name="get_records",
        description=(
            "All-time ranking of drivers or constructors by wins, poles, podiums, fastest laps, "
            "starts, championships, points, win_rate or podium_rate, optionally within a year "
            "range, one nationality, or a minimum number of starts (null for none). limit is "
            "1-25."
        ),
        args=RecordsArgs,
        run=_records_run,
        label=lambda a: f"records: {a.category}",
    )
)
register(
    Tool(
        name="get_champions",
        description=(
            "Drivers' champions by season, with the team they raced for, and the constructors' "
            "champion as a separate field (the two need not be the same team). Newest first, or "
            "oldest first with oldest_first. At most 25 seasons per call (limit 1-25, null for "
            "25); page through the rest with year_from/year_to."
        ),
        args=ChampionsArgs,
        run=_champions_run,
        label=lambda a: "champions",
    )
)
register(
    Tool(
        name="get_best_seasons",
        description=(
            "The most competitive title fights ever, ranked by score (0-100): rank, year, score, "
            "champion and title margin. limit is 1-10."
        ),
        args=BestSeasonsArgs,
        run=_best_seasons_run,
        label=lambda a: "best seasons",
    )
)
