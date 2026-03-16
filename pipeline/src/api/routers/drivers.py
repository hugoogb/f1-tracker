from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from src.api.constants import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE
from src.api.pagination import paginate
from src.api.serializers import constructor_compact, driver_detail
from src.db.database import get_db
from src.db.models import Constructor, Driver, DriverStanding, QualifyingResult, Race, RaceResult
from src.db.queries import get_driver_by_ref, get_driver_career_stats

router = APIRouter()


@router.get("/drivers")
def list_drivers(
    page: int = Query(1, ge=1),
    page_size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    nationality: str | None = None,
    db: Session = Depends(get_db),
):
    base_query = select(Driver)
    count_query = select(func.count()).select_from(Driver)

    if nationality:
        base_query = base_query.where(Driver.nationality.ilike(nationality))
        count_query = count_query.where(Driver.nationality.ilike(nationality))

    return paginate(
        db, base_query.order_by(Driver.last_name), count_query, page, page_size, driver_detail
    )


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
    return driver_detail(driver, stats=stats)


@router.get("/drivers/{ref}/seasons")
def get_driver_seasons(ref: str, db: Session = Depends(get_db)):
    driver = get_driver_by_ref(db, ref)
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")

    season_stats = db.execute(
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
    ).all()

    # Bulk-fetch all constructors referenced in season stats
    constructor_ids = {row.constructor_id for row in season_stats}
    constructors = (
        (db.execute(select(Constructor).where(Constructor.id.in_(constructor_ids))).scalars().all())
        if constructor_ids
        else []
    )
    constructor_map = {c.id: c for c in constructors}

    # Bulk-fetch championship positions: find last race with standings per season
    season_years = [row.season_year for row in season_stats]
    last_races_query = (
        select(
            Race.season_year,
            func.max(Race.round).label("max_round"),
        )
        .where(
            Race.season_year.in_(season_years),
            Race.id.in_(select(DriverStanding.race_id)),
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

    # Fetch all standings for this driver at those last races
    last_race_ids = list(last_race_map.values())
    standings_rows = (
        (
            db.execute(
                select(DriverStanding).where(
                    DriverStanding.race_id.in_(last_race_ids),
                    DriverStanding.driver_id == driver.id,
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
        constructor = constructor_map.get(row.constructor_id)
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
                "constructor": constructor_compact(constructor) if constructor else None,
            }
        )

    return {"seasons": results}


@router.get("/drivers/{ref}/pace")
def get_driver_pace(ref: str, db: Session = Depends(get_db)):
    driver = get_driver_by_ref(db, ref)
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")

    # Average qualifying position per season
    quali_data = db.execute(
        select(
            Race.season_year,
            func.avg(QualifyingResult.position).label("avg_quali"),
            func.count().label("quali_count"),
        )
        .join(Race, QualifyingResult.race_id == Race.id)
        .where(QualifyingResult.driver_id == driver.id)
        .group_by(Race.season_year)
        .order_by(Race.season_year)
    ).all()

    # Average race finishing position per season (only classified finishers)
    race_data = db.execute(
        select(
            Race.season_year,
            func.avg(RaceResult.position).label("avg_race"),
            func.count().label("race_count"),
        )
        .join(Race, RaceResult.race_id == Race.id)
        .where(
            RaceResult.driver_id == driver.id,
            RaceResult.position.isnot(None),
        )
        .group_by(Race.season_year)
        .order_by(Race.season_year)
    ).all()

    # Merge by year
    quali_map = {row.season_year: row for row in quali_data}
    race_map = {row.season_year: row for row in race_data}
    all_years = sorted(set(quali_map.keys()) | set(race_map.keys()))

    seasons = []
    for year in all_years:
        q = quali_map.get(year)
        r = race_map.get(year)

        avg_quali = round(float(q.avg_quali), 2) if q else None
        avg_race = round(float(r.avg_race), 2) if r else None
        delta = None
        if avg_quali is not None and avg_race is not None:
            delta = round(avg_race - avg_quali, 2)

        seasons.append(
            {
                "year": year,
                "avgQualiPosition": avg_quali,
                "avgRacePosition": avg_race,
                "qualiCount": q.quali_count if q else 0,
                "raceCount": r.race_count if r else 0,
                "delta": delta,
            }
        )

    return {
        "driverRef": driver.ref,
        "seasons": seasons,
    }
