from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.db.database import get_db
from src.db.models import Circuit, CircuitLayout, Race

router = APIRouter()


@router.get("/circuits")
def list_circuits(
    page: int = 1,
    page_size: int = 50,
    country: str | None = None,
    db: Session = Depends(get_db),
):
    offset = (page - 1) * page_size

    base_query = select(Circuit)
    count_query = select(func.count()).select_from(Circuit)

    if country:
        base_query = base_query.where(Circuit.country.ilike(country))
        count_query = count_query.where(Circuit.country.ilike(country))

    total = db.execute(count_query).scalar()
    circuits = (
        db.execute(base_query.order_by(Circuit.name).offset(offset).limit(page_size))
        .scalars()
        .all()
    )
    return {
        "data": [
            {
                "id": c.id,
                "ref": c.ref,
                "name": c.name,
                "location": c.location,
                "country": c.country,
                "countryCode": c.country_code,
                "latitude": c.latitude,
                "longitude": c.longitude,
            }
            for c in circuits
        ],
        "total": total,
        "page": page,
        "pageSize": page_size,
    }


@router.get("/circuits/countries")
def list_circuit_countries(db: Session = Depends(get_db)):
    results = (
        db.execute(
            select(Circuit.country)
            .where(Circuit.country.isnot(None))
            .distinct()
            .order_by(Circuit.country)
        )
        .scalars()
        .all()
    )
    return {"countries": results}


@router.get("/circuits/{ref}")
def get_circuit(ref: str, db: Session = Depends(get_db)):
    circuit = db.execute(select(Circuit).where(Circuit.ref == ref)).scalar_one_or_none()
    if not circuit:
        raise HTTPException(status_code=404, detail="Circuit not found")

    races = (
        db.execute(
            select(Race)
            .where(Race.circuit_id == circuit.id)
            .order_by(Race.season_year.desc())
        )
        .scalars()
        .all()
    )

    record_race = db.execute(
        select(Race)
        .where(
            Race.circuit_id == circuit.id,
            Race.fastest_lap_time_ms.isnot(None),
        )
        .order_by(Race.fastest_lap_time_ms)
        .limit(1)
    ).scalar_one_or_none()

    layouts = (
        db.execute(
            select(CircuitLayout)
            .where(CircuitLayout.circuit_id == circuit.id)
            .order_by(CircuitLayout.layout_number)
        )
        .scalars()
        .all()
    )

    lap_record = None
    if record_race and record_race.fastest_lap_driver:
        lap_record = {
            "time": record_race.fastest_lap_time,
            "speed": record_race.fastest_lap_speed,
            "year": record_race.season_year,
            "driver": {
                "ref": record_race.fastest_lap_driver.ref,
                "firstName": record_race.fastest_lap_driver.first_name,
                "lastName": record_race.fastest_lap_driver.last_name,
            },
            "constructor": {
                "ref": record_race.fastest_lap_constructor.ref,
                "name": record_race.fastest_lap_constructor.name,
                "color": record_race.fastest_lap_constructor.color,
            } if record_race.fastest_lap_constructor else None,
        }

    return {
        "id": circuit.id,
        "ref": circuit.ref,
        "name": circuit.name,
        "location": circuit.location,
        "country": circuit.country,
        "countryCode": circuit.country_code,
        "latitude": circuit.latitude,
        "longitude": circuit.longitude,
        "lapRecord": lap_record,
        "layouts": [
            {
                "layoutNumber": ly.layout_number,
                "svgId": ly.svg_id,
                "seasonsActive": ly.seasons_active,
            }
            for ly in layouts
        ],
        "races": [
            {
                "id": r.id,
                "seasonYear": r.season_year,
                "round": r.round,
                "name": r.name,
                "date": str(r.date) if r.date else None,
            }
            for r in races
        ],
    }
