import re

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from src.api.constants import SEARCH_MIN_LENGTH, SEARCH_RESULT_LIMIT
from src.db.database import get_db
from src.db.queries import (
    search_circuits,
    search_constructors,
    search_drivers,
    search_races,
    search_seasons,
)

router = APIRouter()

# A standalone four-digit token in the championship's range: "monaco 2021".
_YEAR = re.compile(r"(?<!\d)(19[5-9]\d|20\d\d|2100)(?!\d)")

_EMPTY = {"drivers": [], "constructors": [], "circuits": [], "seasons": [], "races": []}


def split_year(q: str) -> tuple[str, int | None]:
    """Pull one season year out of a query; return the rest and the year."""
    match = _YEAR.search(q)
    if not match:
        return q.strip(), None
    rest = (q[: match.start()] + " " + q[match.end() :]).strip()
    return " ".join(rest.split()), int(match.group(1))


@router.get("/search")
def search(q: str = "", db: Session = Depends(get_db)):
    if not q or len(q) < SEARCH_MIN_LENGTH:
        return _EMPTY

    text, year = split_year(q)
    # "monaco 2021" looks for Monaco among drivers/teams/circuits, not the
    # whole string; a bare year finds no driver called "2021".
    entity_query = text if year is not None else q
    drivers = search_drivers(db, entity_query, limit=SEARCH_RESULT_LIMIT) if entity_query else []
    constructors = (
        search_constructors(db, entity_query, limit=SEARCH_RESULT_LIMIT) if entity_query else []
    )
    circuits = search_circuits(db, entity_query, limit=SEARCH_RESULT_LIMIT) if entity_query else []
    seasons = search_seasons(db, year) if year is not None else []
    races = search_races(db, text, year, limit=SEARCH_RESULT_LIMIT)

    return {
        "drivers": [
            {
                "id": d.id,
                "ref": d.ref,
                "firstName": d.first_name,
                "lastName": d.last_name,
                "code": d.code,
                "nationality": d.nationality,
            }
            for d in drivers
        ],
        "constructors": [
            {
                "id": c.id,
                "ref": c.ref,
                "name": c.name,
                "nationality": c.nationality,
                "color": c.color,
            }
            for c in constructors
        ],
        "circuits": [
            {
                "id": c.id,
                "ref": c.ref,
                "name": c.name,
                "location": c.location,
                "country": c.country,
            }
            for c in circuits
        ],
        "seasons": [{"year": y} for y in seasons],
        "races": [
            {
                "year": r.season_year,
                "round": r.round,
                "name": r.name,
                "circuitName": r.circuit.name,
                "date": r.date.isoformat() if r.date else None,
            }
            for r in races
        ],
    }
