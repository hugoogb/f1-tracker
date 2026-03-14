from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from src.db.database import get_db
from src.db.queries import get_all_seasons, get_season_races

router = APIRouter()


@router.get("/seasons")
def list_seasons(db: Session = Depends(get_db)):
    seasons = get_all_seasons(db)
    return {"data": [{"year": s.year, "url": s.url} for s in seasons]}


@router.get("/seasons/{year}")
def get_season(year: int, db: Session = Depends(get_db)):
    races = get_season_races(db, year)
    return {
        "year": year,
        "races": [
            {
                "id": r.id,
                "round": r.round,
                "name": r.name,
                "date": str(r.date) if r.date else None,
                "circuit": {
                    "id": r.circuit.id,
                    "ref": r.circuit.ref,
                    "name": r.circuit.name,
                    "location": r.circuit.location,
                    "country": r.circuit.country,
                    "countryCode": r.circuit.country_code,
                },
            }
            for r in races
        ],
    }
