"""Site tools: search, site_map and navigate. All read-only; navigate does no I/O."""

from __future__ import annotations

import re

from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from src.api.routers.search import search as _search
from src.chat.constants import NAVIGATE
from src.chat.tools.registry import Tool, register

SITE_PAGES = [
    {
        "title": "Home",
        "href": "/",
        "shows": (
            "championship leader, next race countdown, top-5 standings, last podium, "
            "title permutations, world tour map"
        ),
    },
    {"title": "Seasons", "href": "/seasons", "shows": "one tile per year with its champion"},
    {
        "title": "Current season",
        "href": "/seasons/current",
        "shows": "redirects to the latest season's detail page",
    },
    {
        "title": "Season detail",
        "href": "/seasons/{year}",
        "shows": (
            "standings, charts, championship progression, title permutations, calendar, "
            "what-if scoring"
        ),
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
        "shows": (
            "all-time records: wins, poles, podiums, championships, fastest laps, starts, "
            "with era/nationality filters"
        ),
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


# Allowlist, not a prefix check: browsers read `/\\x` and `/<tab>/x` as `//x`, an external host.
_SITE_PATH = re.compile(r"^/[A-Za-z0-9_\-./]*(\?[A-Za-z0-9_=&\-]*)?$")


class _NoArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SearchArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    q: str


class NavigateArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    href: str


def _name(d: dict) -> str:
    return f"{d['firstName']} {d['lastName']}"


def _search_run(db: Session, args: SearchArgs) -> dict:
    r = _search(q=args.q, db=db)
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


def _navigate_run(db: Session, args: NavigateArgs) -> dict:
    if _SITE_PATH.fullmatch(args.href) and "//" not in args.href:
        return {"navigated": True, "href": args.href}
    return {"error": "only site paths can be opened"}


register(
    Tool(
        name="search",
        description=(
            "Find drivers, constructors, circuits, seasons and races by name. Returns refs and "
            "hrefs. A year in the query finds that season and its races (e.g. 'monaco 2021')."
        ),
        args=SearchArgs,
        run=_search_run,
        label=lambda a: f"search: {a.q}"[:60],
    )
)

register(
    Tool(
        name="site_map",
        description=(
            "Every page of the site with what it shows, for 'where can I see...' questions."
        ),
        args=_NoArgs,
        run=lambda db, a: {"pages": SITE_PAGES},
        label=lambda a: "site map",
    )
)

register(
    Tool(
        name=NAVIGATE,
        description=(
            "Open a page of this site for the user. Takes a site path such as "
            "'/seasons/2021/races/22' (use hrefs from other tools); external URLs are refused."
        ),
        args=NavigateArgs,
        run=_navigate_run,
        label=lambda a: f"opening {a.href}"[:60],
    )
)
