from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from src.db.database import get_db
from src.db.models import Race, RaceResult
from src.db.queries import get_driver_by_ref, get_driver_career_stats

router = APIRouter()


@router.get("/compare/drivers")
def compare_drivers(d1: str, d2: str, db: Session = Depends(get_db)):
    driver1 = get_driver_by_ref(db, d1)
    if not driver1:
        raise HTTPException(status_code=404, detail=f"Driver '{d1}' not found")

    driver2 = get_driver_by_ref(db, d2)
    if not driver2:
        raise HTTPException(status_code=404, detail=f"Driver '{d2}' not found")

    # Career stats
    stats1 = get_driver_career_stats(db, driver1.id)
    stats2 = get_driver_career_stats(db, driver2.id)

    # Head-to-head: find races where both drivers participated
    d1_races = select(RaceResult.race_id).where(RaceResult.driver_id == driver1.id).subquery()
    d2_races = select(RaceResult.race_id).where(RaceResult.driver_id == driver2.id).subquery()

    common_race_ids = (
        select(d1_races.c.race_id)
        .where(d1_races.c.race_id.in_(select(d2_races.c.race_id)))
        .subquery()
    )

    # Get results for both drivers in common races
    r1_alias = RaceResult.__table__.alias("r1")
    r2_alias = RaceResult.__table__.alias("r2")

    head_to_head = db.execute(
        select(
            func.count().label("total"),
            func.sum(
                case(
                    (
                        (r1_alias.c.position.isnot(None)) & (r2_alias.c.position.is_(None)),
                        1,
                    ),
                    (
                        (r1_alias.c.position.isnot(None))
                        & (r2_alias.c.position.isnot(None))
                        & (r1_alias.c.position < r2_alias.c.position),
                        1,
                    ),
                    else_=0,
                )
            ).label("d1_wins"),
            func.sum(
                case(
                    (
                        (r2_alias.c.position.isnot(None)) & (r1_alias.c.position.is_(None)),
                        1,
                    ),
                    (
                        (r1_alias.c.position.isnot(None))
                        & (r2_alias.c.position.isnot(None))
                        & (r2_alias.c.position < r1_alias.c.position),
                        1,
                    ),
                    else_=0,
                )
            ).label("d2_wins"),
        )
        .select_from(r1_alias)
        .join(r2_alias, r1_alias.c.race_id == r2_alias.c.race_id)
        .where(
            r1_alias.c.driver_id == driver1.id,
            r2_alias.c.driver_id == driver2.id,
            r1_alias.c.race_id.in_(select(common_race_ids.c.race_id)),
        )
    ).one()

    # Season history for both drivers
    def get_driver_season_history(driver_id: str):
        rows = db.execute(
            select(
                Race.season_year,
                func.sum(RaceResult.points).label("points"),
            )
            .join(Race, RaceResult.race_id == Race.id)
            .where(RaceResult.driver_id == driver_id)
            .group_by(Race.season_year)
            .order_by(Race.season_year)
        ).all()
        return [{"year": row.season_year, "points": float(row.points or 0)} for row in rows]

    def format_driver(driver, stats):
        return {
            "id": driver.id,
            "ref": driver.ref,
            "code": driver.code,
            "number": driver.number,
            "firstName": driver.first_name,
            "lastName": driver.last_name,
            "nationality": driver.nationality,
            "countryCode": driver.country_code,
            "dateOfBirth": str(driver.date_of_birth) if driver.date_of_birth else None,
            "headshotUrl": f"/headshots/{driver.ref}.png" if driver.has_headshot else None,
            "stats": stats,
        }

    return {
        "driver1": format_driver(driver1, stats1),
        "driver2": format_driver(driver2, stats2),
        "headToHead": {
            "driver1Wins": int(head_to_head.d1_wins or 0),
            "driver2Wins": int(head_to_head.d2_wins or 0),
            "totalRaces": int(head_to_head.total or 0),
        },
        "driver1Seasons": get_driver_season_history(driver1.id),
        "driver2Seasons": get_driver_season_history(driver2.id),
    }
