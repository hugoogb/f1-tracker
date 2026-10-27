"""Six thin tool wrappers over the API's router functions, for the provider eval.

Throwaway: the real tool set is built after the eval decides the model. The
payloads here follow the spec's compactness rule (top-N lists, hrefs, no ids).
"""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from src.api.routers.drivers import get_driver as _get_driver
from src.api.routers.races import get_qualifying as _get_qualifying
from src.api.routers.races import get_race as _get_race
from src.api.routers.records import explore_records as _explore_records
from src.api.routers.search import search as _search
from src.api.routers.standings import constructor_standings as _constructor_standings
from src.api.routers.standings import driver_standings as _driver_standings
from src.db.models import Race
from src.db.queries import get_driver_standings_for_season

SITE_PAGES = [
    {
        "title": "Home",
        "href": "/",
        "shows": "championship leader, next race countdown, top-5 standings, last podium, title permutations, world tour map",
    },
    {"title": "Seasons", "href": "/seasons", "shows": "one tile per year with its champion"},
    {
        "title": "Season detail",
        "href": "/seasons/{year}",
        "shows": "standings, charts, championship progression, title permutations, calendar, what-if scoring",
    },
    {
        "title": "In-season compare",
        "href": "/seasons/{year}/compare?type=drivers&a={ref}&b={ref}",
        "shows": "two drivers or two constructors in one season",
    },
    {
        "title": "Race detail",
        "href": "/seasons/{year}/races/{round}",
        "shows": "results, qualifying, sprint, pit stops, lap charts",
    },
    {"title": "Drivers", "href": "/drivers", "shows": "driver list, filter by nationality"},
    {
        "title": "Driver profile",
        "href": "/drivers/{ref}",
        "shows": "career stats, career chart, season history",
    },
    {"title": "Constructors", "href": "/constructors", "shows": "constructor list"},
    {
        "title": "Constructor profile",
        "href": "/constructors/{ref}",
        "shows": "stats, roster, team lineage",
    },
    {"title": "Circuits", "href": "/circuits", "shows": "circuit list and world map"},
    {
        "title": "Circuit detail",
        "href": "/circuits/{ref}",
        "shows": "location, track layout, race history",
    },
    {
        "title": "Champions",
        "href": "/champions",
        "shows": "every drivers' and constructors' champion",
    },
    {
        "title": "Records",
        "href": "/records",
        "shows": "all-time records: wins, poles, podiums, championships, fastest laps, starts, with era/nationality filters",
    },
    {
        "title": "Best seasons",
        "href": "/best-seasons",
        "shows": "seasons ranked by how close the title fight was",
    },
    {"title": "Compare", "href": "/compare", "shows": "pick two drivers or two constructors"},
    {
        "title": "Compare drivers",
        "href": "/compare/drivers",
        "shows": "side-by-side career comparison of two drivers",
    },
    {
        "title": "Compare constructors",
        "href": "/compare/constructors",
        "shows": "side-by-side comparison of two constructors",
    },
    {
        "title": "Favourites",
        "href": "/favourites",
        "shows": "starred drivers, constructors and circuits",
    },
    {"title": "Data status", "href": "/status", "shows": "data freshness and coverage"},
    {"title": "Attributions", "href": "/attributions", "shows": "data sources and licences"},
]


def _name(d: dict) -> str:
    return f"{d['firstName']} {d['lastName']}"


def site_map(db: Session) -> dict:
    return {"pages": SITE_PAGES}


def search(db: Session, q: str) -> dict:
    r = _search(q=q, db=db)
    return {
        "drivers": [
            {
                "name": _name(d),
                "ref": d["ref"],
                "nationality": d["nationality"],
                "href": f"/drivers/{d['ref']}",
            }
            for d in r["drivers"]
        ],
        "constructors": [
            {"name": c["name"], "ref": c["ref"], "href": f"/constructors/{c['ref']}"}
            for c in r["constructors"]
        ],
        "circuits": [
            {
                "name": c["name"],
                "ref": c["ref"],
                "country": c["country"],
                "href": f"/circuits/{c['ref']}",
            }
            for c in r["circuits"]
        ],
        "seasons": [{"year": s["year"], "href": f"/seasons/{s['year']}"} for s in r["seasons"]],
        "races": [
            {
                "year": x["year"],
                "round": x["round"],
                "name": x["name"],
                "date": x["date"],
                "href": f"/seasons/{x['year']}/races/{x['round']}",
            }
            for x in r["races"]
        ],
    }


def get_standings(db: Session, year: int, kind: str = "drivers", limit: int = 10) -> dict:
    rows = get_driver_standings_for_season(db, year)
    if not rows:
        return {"error": f"No standings for {year}"}
    race = db.get(Race, rows[0].race_id)
    as_of = {
        "round": race.round,
        "name": race.name,
        "date": str(race.date),
        "href": f"/seasons/{year}/races/{race.round}",
    }
    if kind == "constructors":
        r = _constructor_standings(year=year, db=db)
        table = [
            {
                "position": s["position"],
                "constructor": s["constructor"]["name"],
                "ref": s["constructor"]["ref"],
                "points": s["points"],
                "wins": s["wins"],
                "href": f"/constructors/{s['constructor']['ref']}",
            }
            for s in r["standings"][:limit]
        ]
    else:
        r = _driver_standings(year=year, db=db)
        table = [
            {
                "position": s["position"],
                "driver": _name(s["driver"]),
                "ref": s["driver"]["ref"],
                "constructor": s["constructor"]["name"] if s["constructor"] else None,
                "points": s["points"],
                "wins": s["wins"],
                "href": f"/drivers/{s['driver']['ref']}",
            }
            for s in r["standings"][:limit]
        ]
    return {
        "year": year,
        "kind": kind,
        "asOfRound": as_of,
        "href": f"/seasons/{year}",
        "note": "Official championship table after that round. Position 1 after the final round is the champion.",
        "standings": table,
    }


def get_race(db: Session, year: int, round: int, section: str = "results") -> dict:
    href = f"/seasons/{year}/races/{round}"
    if section == "qualifying":
        r = _get_qualifying(year=year, round=round, db=db)
        rows = r.get("results") or r.get("qualifying") or []
        return {
            "year": year,
            "round": round,
            "href": href,
            "section": "qualifying",
            "top": [
                {
                    "position": q.get("position"),
                    "driver": _name(q["driver"]),
                    "constructor": (q.get("constructor") or {}).get("name"),
                }
                for q in rows[:10]
            ],
        }
    r = _get_race(year=year, round=round, db=db)
    fl = r["fastestLap"]
    return {
        "year": year,
        "round": round,
        "name": r["name"],
        "date": r["date"],
        "href": href,
        "circuit": {
            "name": r["circuit"]["name"],
            "country": r["circuit"]["country"],
            "href": f"/circuits/{r['circuit']['ref']}",
        },
        "fastestLap": {
            "driver": f"{fl['driver']['firstName']} {fl['driver']['lastName']}",
            "lap": fl["lapNumber"],
            "time": fl["time"],
        }
        if fl
        else None,
        "results": [
            {
                "position": x["position"],
                "driver": _name(x["driver"]),
                "ref": x["driver"]["ref"],
                "constructor": x["constructor"]["name"],
                "grid": x["grid"],
                "points": x["points"],
                "status": x["status"],
            }
            for x in r["results"][:10]
        ],
    }


def get_driver(db: Session, ref: str) -> dict:
    d = _get_driver(ref=ref, db=db)
    return {
        "name": _name(d),
        "ref": ref,
        "code": d["code"],
        "nationality": d["nationality"],
        "dateOfBirth": d["dateOfBirth"],
        "href": f"/drivers/{ref}",
        "career": {
            "starts": d["stats"]["total_races"],
            "wins": d["stats"]["wins"],
            "podiums": d["stats"]["podiums"],
            "poles": d["stats"]["poles"],
            "fastestLaps": d["stats"]["fastest_laps"],
            "championships": d["stats"]["championships"],
            "points": d["stats"]["total_points"],
        },
    }


def get_records(
    db: Session,
    entity: str = "driver",
    category: str = "wins",
    year_from: int | None = None,
    year_to: int | None = None,
    nationality: str | None = None,
    min_starts: int | None = None,
    limit: int = 10,
) -> dict:
    r = _explore_records(
        entity=entity,
        category=category,
        era=None,
        year_from=year_from,
        year_to=year_to,
        nationality=nationality if entity == "driver" else None,
        country=nationality if entity == "constructor" else None,
        min_starts=min_starts,
        sort="desc",
        page=1,
        limit=max(1, min(limit, 25)),
        db=db,
    )
    key = "driver" if entity == "driver" else "constructor"
    return {
        "entity": entity,
        "category": category,
        "label": r["label"],
        "yearFrom": r["yearFrom"],
        "yearTo": r["yearTo"],
        "nationality": r["nationality"],
        "minStarts": r["minStarts"],
        "href": "/records",
        "note": r["note"],
        "rows": [
            {
                "rank": x["rank"],
                "name": _name(x[key]) if key == "driver" else x[key]["name"],
                "ref": x[key]["ref"],
                "value": x["value"],
                "starts": x["starts"],
                "href": f"/{key}s/{x[key]['ref']}",
            }
            for x in r["data"]
        ],
    }


TOOLS: dict[str, Any] = {
    "search": search,
    "site_map": site_map,
    "get_standings": get_standings,
    "get_race": get_race,
    "get_driver": get_driver,
    "get_records": get_records,
}


def _schema(props: dict, required: list[str]) -> dict:
    return {
        "type": "object",
        "properties": props,
        "required": required,
        "additionalProperties": False,
    }


SPECS = [
    {
        "name": "search",
        "description": "Find drivers, constructors, circuits, seasons and races by name. Returns refs and hrefs. A year in the query finds that season and its races (e.g. 'monaco 2021').",
        "input_schema": _schema(
            {"q": {"type": "string", "description": "Name or name plus year"}}, ["q"]
        ),
    },
    {
        "name": "site_map",
        "description": "Every page of the site with what it shows, for 'where can I see…' questions.",
        "input_schema": _schema({}, []),
    },
    {
        "name": "get_standings",
        "description": "Official championship standings for a season after its latest round (drivers or constructors): position, points, wins, team. Also tells which round the table is after (the latest race with results). The current season is 2026.",
        "input_schema": _schema(
            {
                "year": {"type": "integer"},
                "kind": {"type": "string", "enum": ["drivers", "constructors"]},
                "limit": {"type": "integer", "description": "Rows to return, default 10"},
            },
            ["year", "kind", "limit"],
        ),
    },
    {
        "name": "get_race",
        "description": "One race weekend: results (top 10 with grid, points, status, fastest lap) or qualifying order. Needs the season year and round number (find the round with search).",
        "input_schema": _schema(
            {
                "year": {"type": "integer"},
                "round": {"type": "integer"},
                "section": {"type": "string", "enum": ["results", "qualifying"]},
            },
            ["year", "round", "section"],
        ),
    },
    {
        "name": "get_driver",
        "description": "A driver's profile and career totals: starts, wins, podiums, poles, fastest laps, championships, points. Needs the driver ref (e.g. 'lewis-hamilton'; find it with search).",
        "input_schema": _schema({"ref": {"type": "string"}}, ["ref"]),
    },
    {
        "name": "get_records",
        "description": "All-time records ranking, filterable: category wins/poles/podiums/fastest_laps/starts/championships/points/win_rate/podium_rate, optional season range, nationality (drivers) and minimum starts.",
        "input_schema": _schema(
            {
                "entity": {"type": "string", "enum": ["driver", "constructor"]},
                "category": {
                    "type": "string",
                    "enum": [
                        "wins",
                        "poles",
                        "podiums",
                        "fastest_laps",
                        "starts",
                        "championships",
                        "points",
                        "win_rate",
                        "podium_rate",
                    ],
                },
                "year_from": {"type": ["integer", "null"]},
                "year_to": {"type": ["integer", "null"]},
                "nationality": {
                    "type": ["string", "null"],
                    "description": "e.g. 'British', 'Spanish'",
                },
                "min_starts": {"type": ["integer", "null"]},
                "limit": {"type": "integer", "description": "Rows, default 10"},
            },
            ["entity", "category", "year_from", "year_to", "nationality", "min_starts", "limit"],
        ),
    },
]


def run_tool(db: Session, name: str, args: dict) -> str:
    fn = TOOLS.get(name)
    if fn is None:
        return json.dumps({"error": f"unknown tool {name}"})
    try:
        clean = {k: v for k, v in args.items() if v is not None}
        return json.dumps(fn(db, **clean), default=str)
    except Exception as e:  # noqa: BLE001 - the model gets the error text
        db.rollback()
        return json.dumps({"error": f"{type(e).__name__}: {e}"[:300]})
