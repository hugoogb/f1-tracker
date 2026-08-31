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
    split_year,
)

router = APIRouter()


@router.get("/search")
def search(q: str = "", db: Session = Depends(get_db)):
    if not q or len(q) < SEARCH_MIN_LENGTH:
        return {"drivers": [], "constructors": [], "circuits": [], "races": [], "seasons": []}

    # Drivers, constructors and circuits have no season of their own, so a year
    # in the query is noise to them: "monaco 2019" should still surface the
    # Monaco circuit. Races and seasons get the full query — the year is the
    # most selective part of it there.
    _, text = split_year(q)

    drivers = search_drivers(db, text, limit=SEARCH_RESULT_LIMIT) if text else []
    constructors = search_constructors(db, text, limit=SEARCH_RESULT_LIMIT) if text else []
    circuits = search_circuits(db, text, limit=SEARCH_RESULT_LIMIT) if text else []
    races = search_races(db, q, limit=SEARCH_RESULT_LIMIT)
    seasons = search_seasons(db, q, limit=SEARCH_RESULT_LIMIT)

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
        "races": [
            {
                "id": r.id,
                "seasonYear": r.season_year,
                "round": r.round,
                "name": r.name,
                "date": str(r.date) if r.date else None,
                "circuit": {
                    "ref": r.circuit.ref,
                    "name": r.circuit.name,
                    "country": r.circuit.country,
                    "countryCode": r.circuit.country_code,
                },
            }
            for r in races
        ],
        "seasons": [{"year": s.year} for s in seasons],
    }
