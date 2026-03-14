from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from src.db.database import get_db
from src.db.models import Constructor, ConstructorStanding, Driver, Race, RaceResult
from src.db.queries import get_constructor_by_ref, get_constructor_career_stats

router = APIRouter()


@router.get("/constructors")
def list_constructors(
    page: int = 1,
    page_size: int = 50,
    nationality: str | None = None,
    db: Session = Depends(get_db),
):
    offset = (page - 1) * page_size

    base_query = select(Constructor)
    count_query = select(func.count()).select_from(Constructor)

    if nationality:
        base_query = base_query.where(Constructor.nationality.ilike(nationality))
        count_query = count_query.where(Constructor.nationality.ilike(nationality))

    total = db.execute(count_query).scalar()
    constructors = (
        db.execute(base_query.order_by(Constructor.name).offset(offset).limit(page_size))
        .scalars()
        .all()
    )
    return {
        "data": [
            {
                "id": c.id,
                "ref": c.ref,
                "name": c.name,
                "nationality": c.nationality,
                "color": c.color,
            }
            for c in constructors
        ],
        "total": total,
        "page": page,
        "pageSize": page_size,
    }


@router.get("/constructors/nationalities")
def list_constructor_nationalities(db: Session = Depends(get_db)):
    results = (
        db.execute(
            select(Constructor.nationality)
            .where(Constructor.nationality.isnot(None))
            .distinct()
            .order_by(Constructor.nationality)
        )
        .scalars()
        .all()
    )
    return {"nationalities": results}


@router.get("/constructors/{ref}")
def get_constructor(ref: str, db: Session = Depends(get_db)):
    constructor = get_constructor_by_ref(db, ref)
    if not constructor:
        raise HTTPException(status_code=404, detail="Constructor not found")

    stats = get_constructor_career_stats(db, constructor.id)
    return {
        "id": constructor.id,
        "ref": constructor.ref,
        "name": constructor.name,
        "nationality": constructor.nationality,
        "color": constructor.color,
        "stats": stats,
    }


@router.get("/constructors/{ref}/roster")
def get_constructor_roster(ref: str, year: int | None = None, db: Session = Depends(get_db)):
    constructor = get_constructor_by_ref(db, ref)
    if not constructor:
        raise HTTPException(status_code=404, detail="Constructor not found")

    if year is None:
        year = db.execute(
            select(func.max(Race.season_year))
            .join(RaceResult, RaceResult.race_id == Race.id)
            .where(RaceResult.constructor_id == constructor.id)
        ).scalar()

    if not year:
        return {"year": None, "drivers": []}

    driver_ids = (
        db.execute(
            select(RaceResult.driver_id)
            .distinct()
            .join(Race, RaceResult.race_id == Race.id)
            .where(
                RaceResult.constructor_id == constructor.id,
                Race.season_year == year,
            )
        )
        .scalars()
        .all()
    )

    drivers = [db.get(Driver, did) for did in driver_ids]

    return {
        "year": year,
        "drivers": [
            {
                "id": d.id,
                "ref": d.ref,
                "code": d.code,
                "firstName": d.first_name,
                "lastName": d.last_name,
                "nationality": d.nationality,
            }
            for d in drivers
            if d
        ],
    }


@router.get("/constructors/{ref}/seasons")
def get_constructor_seasons(ref: str, db: Session = Depends(get_db)):
    constructor = get_constructor_by_ref(db, ref)
    if not constructor:
        raise HTTPException(status_code=404, detail="Constructor not found")

    season_stats = db.execute(
        select(
            Race.season_year,
            func.count().label("races"),
            func.sum(case((RaceResult.position == 1, 1), else_=0)).label("wins"),
            func.sum(case((RaceResult.position <= 3, 1), else_=0)).label("podiums"),
            func.sum(RaceResult.points).label("points"),
        )
        .join(Race, RaceResult.race_id == Race.id)
        .where(RaceResult.constructor_id == constructor.id)
        .group_by(Race.season_year)
        .order_by(Race.season_year.desc())
    ).all()

    results = []
    for row in season_stats:
        # Look up championship position from final standings
        last_race = db.execute(
            select(Race)
            .where(Race.season_year == row.season_year)
            .order_by(Race.round.desc())
            .limit(1)
        ).scalar_one_or_none()
        championship_position = None
        if last_race:
            standing = db.execute(
                select(ConstructorStanding).where(
                    ConstructorStanding.race_id == last_race.id,
                    ConstructorStanding.constructor_id == constructor.id,
                )
            ).scalar_one_or_none()
            if standing:
                championship_position = standing.position

        results.append(
            {
                "year": row.season_year,
                "races": row.races,
                "wins": row.wins,
                "podiums": row.podiums,
                "points": float(row.points or 0),
                "championshipPosition": championship_position,
            }
        )

    return {"seasons": results}
