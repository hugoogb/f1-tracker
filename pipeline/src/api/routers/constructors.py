from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from src.api.constants import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE
from src.api.pagination import paginate
from src.api.serializers import constructor_detail, driver_summary
from src.db.database import get_db
from src.db.models import Constructor, ConstructorStanding, Driver, Race, RaceResult
from src.db.queries import get_constructor_by_ref, get_constructor_career_stats

router = APIRouter()


@router.get("/constructors")
def list_constructors(
    page: int = Query(1, ge=1),
    page_size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    nationality: str | None = None,
    db: Session = Depends(get_db),
):
    base_query = select(Constructor)
    count_query = select(func.count()).select_from(Constructor)

    if nationality:
        base_query = base_query.where(Constructor.nationality.ilike(nationality))
        count_query = count_query.where(Constructor.nationality.ilike(nationality))

    return paginate(
        db, base_query.order_by(Constructor.name), count_query, page, page_size, constructor_detail
    )


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
    return constructor_detail(constructor, stats=stats)


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

    drivers = (
        (db.execute(select(Driver).where(Driver.id.in_(driver_ids))).scalars().all())
        if driver_ids
        else []
    )

    return {
        "year": year,
        "drivers": [driver_summary(d) for d in drivers],
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

    # Bulk-fetch championship positions: find last race with standings per season
    season_years = [row.season_year for row in season_stats]
    last_races_query = (
        select(
            Race.season_year,
            func.max(Race.round).label("max_round"),
        )
        .where(
            Race.season_year.in_(season_years),
            Race.id.in_(select(ConstructorStanding.race_id)),
        )
        .group_by(Race.season_year)
        .subquery()
    )
    last_race_rows = db.execute(
        select(Race.id, Race.season_year).join(
            last_races_query,
            (Race.season_year == last_races_query.c.season_year)
            & (Race.round == last_races_query.c.max_round),
        )
    ).all()
    last_race_map = {row.season_year: row.id for row in last_race_rows}

    last_race_ids = list(last_race_map.values())
    standings_rows = (
        (
            db.execute(
                select(ConstructorStanding).where(
                    ConstructorStanding.race_id.in_(last_race_ids),
                    ConstructorStanding.constructor_id == constructor.id,
                )
            )
            .scalars()
            .all()
        )
        if last_race_ids
        else []
    )
    standing_by_race = {s.race_id: s.position for s in standings_rows}

    results = []
    for row in season_stats:
        race_id = last_race_map.get(row.season_year)
        championship_position = standing_by_race.get(race_id) if race_id else None

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
