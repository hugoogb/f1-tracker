from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from src.db.database import get_db
from src.db.queries import search_circuits, search_constructors, search_drivers

router = APIRouter()


@router.get("/search")
def search(q: str = "", db: Session = Depends(get_db)):
    if not q or len(q) < 2:
        return {"drivers": [], "constructors": [], "circuits": []}

    drivers = search_drivers(db, q, limit=5)
    constructors = search_constructors(db, q, limit=5)
    circuits = search_circuits(db, q, limit=5)

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
    }
