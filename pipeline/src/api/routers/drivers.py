from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from src.db.database import get_db
from src.db.models import Constructor, Driver, DriverStanding, Race, RaceResult
from src.db.queries import get_driver_by_ref, get_driver_career_stats

router = APIRouter()


@router.get("/drivers")
def list_drivers(
    page: int = 1,
    page_size: int = 50,
    nationality: str | None = None,
    db: Session = Depends(get_db),
):
    offset = (page - 1) * page_size

    base_query = select(Driver)
    count_query = select(func.count()).select_from(Driver)

    if nationality:
        base_query = base_query.where(Driver.nationality.ilike(nationality))
        count_query = count_query.where(Driver.nationality.ilike(nationality))

    total = db.execute(count_query).scalar()
    drivers = (
        db.execute(
            base_query.order_by(Driver.last_name).offset(offset).limit(page_size)
        )
        .scalars()
        .all()
    )
    return {
        "data": [
            {
                "id": d.id,
                "ref": d.ref,
                "code": d.code,
                "number": d.number,
                "firstName": d.first_name,
                "lastName": d.last_name,
                "nationality": d.nationality,
                "dateOfBirth": str(d.date_of_birth) if d.date_of_birth else None,
            }
            for d in drivers
        ],
        "total": total,
        "page": page,
        "pageSize": page_size,
    }


@router.get("/drivers/nationalities")
def list_driver_nationalities(db: Session = Depends(get_db)):
    results = (
        db.execute(
            select(Driver.nationality)
            .where(Driver.nationality.isnot(None))
            .distinct()
            .order_by(Driver.nationality)
        )
        .scalars()
        .all()
    )
    return {"nationalities": results}


@router.get("/drivers/{ref}")
def get_driver(ref: str, db: Session = Depends(get_db)):
    driver = get_driver_by_ref(db, ref)
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")

    stats = get_driver_career_stats(db, driver.id)
    return {
        "id": driver.id,
        "ref": driver.ref,
        "code": driver.code,
        "number": driver.number,
        "firstName": driver.first_name,
        "lastName": driver.last_name,
        "nationality": driver.nationality,
        "dateOfBirth": str(driver.date_of_birth) if driver.date_of_birth else None,
        "stats": stats,
    }


@router.get("/drivers/{ref}/seasons")
def get_driver_seasons(ref: str, db: Session = Depends(get_db)):
    driver = get_driver_by_ref(db, ref)
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")

    season_stats = (
        db.execute(
            select(
                Race.season_year,
                RaceResult.constructor_id,
                func.count().label("races"),
                func.sum(case((RaceResult.position == 1, 1), else_=0)).label("wins"),
                func.sum(case((RaceResult.position <= 3, 1), else_=0)).label("podiums"),
                func.sum(RaceResult.points).label("points"),
            )
            .join(Race, RaceResult.race_id == Race.id)
            .where(RaceResult.driver_id == driver.id)
            .group_by(Race.season_year, RaceResult.constructor_id)
            .order_by(Race.season_year.desc())
        )
        .all()
    )

    results = []
    for row in season_stats:
        constructor = db.get(Constructor, row.constructor_id)

        # Look up championship position from final standings
        last_race = (
            db.execute(
                select(Race)
                .where(Race.season_year == row.season_year)
                .order_by(Race.round.desc())
                .limit(1)
            )
            .scalar_one_or_none()
        )
        championship_position = None
        if last_race:
            standing = db.execute(
                select(DriverStanding).where(
                    DriverStanding.race_id == last_race.id,
                    DriverStanding.driver_id == driver.id,
                )
            ).scalar_one_or_none()
            if standing:
                championship_position = standing.position

        results.append({
            "year": row.season_year,
            "races": row.races,
            "wins": row.wins,
            "podiums": row.podiums,
            "points": float(row.points or 0),
            "championshipPosition": championship_position,
            "constructor": {
                "id": constructor.id,
                "ref": constructor.ref,
                "name": constructor.name,
                "color": constructor.color,
            } if constructor else None,
        })

    return {"seasons": results}
