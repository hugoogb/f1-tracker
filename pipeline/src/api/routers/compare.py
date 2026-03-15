from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from src.db.database import get_db
from src.db.models import Constructor, QualifyingResult, Race, RaceResult
from src.db.queries import (
    get_constructor_by_ref,
    get_constructor_career_stats,
    get_driver_by_ref,
    get_driver_career_stats,
)

router = APIRouter()


@router.get("/compare/drivers")
def compare_drivers(d1: str, d2: str, teammate: bool = False, db: Session = Depends(get_db)):
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

    # Teammate filtering: find races where both drove for same constructor
    teammate_race_ids = None
    teammate_seasons = []
    if teammate:
        tm_r1 = RaceResult.__table__.alias("tm_r1")
        tm_r2 = RaceResult.__table__.alias("tm_r2")
        teammate_rows = db.execute(
            select(tm_r1.c.race_id)
            .join(tm_r2, tm_r1.c.race_id == tm_r2.c.race_id)
            .where(
                tm_r1.c.driver_id == driver1.id,
                tm_r2.c.driver_id == driver2.id,
                tm_r1.c.constructor_id == tm_r2.c.constructor_id,
            )
        ).scalars().all()
        teammate_race_ids = set(teammate_rows)

    # Find teammate seasons regardless of filter
    tm_seasons_r1 = RaceResult.__table__.alias("tms_r1")
    tm_seasons_r2 = RaceResult.__table__.alias("tms_r2")
    tm_season_rows = db.execute(
        select(func.distinct(Race.season_year))
        .select_from(tm_seasons_r1)
        .join(tm_seasons_r2,
              (tm_seasons_r1.c.race_id == tm_seasons_r2.c.race_id)
              & (tm_seasons_r1.c.constructor_id == tm_seasons_r2.c.constructor_id))
        .join(Race, tm_seasons_r1.c.race_id == Race.id)
        .where(
            tm_seasons_r1.c.driver_id == driver1.id,
            tm_seasons_r2.c.driver_id == driver2.id,
        )
        .order_by(Race.season_year)
    ).scalars().all()
    teammate_seasons = list(tm_season_rows)

    # Recompute head-to-head if teammate filter is applied
    if teammate and teammate_race_ids:
        # Filter common races to only teammate races
        h2h_filter = r1_alias.c.race_id.in_(teammate_race_ids)
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
                h2h_filter,
            )
        ).one()

    # Qualifying head-to-head
    q1_alias = QualifyingResult.__table__.alias("q1")
    q2_alias = QualifyingResult.__table__.alias("q2")

    quali_filter_clause = []
    if teammate and teammate_race_ids:
        quali_filter_clause.append(q1_alias.c.race_id.in_(teammate_race_ids))

    quali_h2h = db.execute(
        select(
            func.count().label("total"),
            func.sum(
                case(
                    (q1_alias.c.position < q2_alias.c.position, 1),
                    else_=0,
                )
            ).label("d1_wins"),
            func.sum(
                case(
                    (q2_alias.c.position < q1_alias.c.position, 1),
                    else_=0,
                )
            ).label("d2_wins"),
        )
        .select_from(q1_alias)
        .join(q2_alias, q1_alias.c.race_id == q2_alias.c.race_id)
        .where(
            q1_alias.c.driver_id == driver1.id,
            q2_alias.c.driver_id == driver2.id,
            *quali_filter_clause,
        )
    ).one()

    # Radar stats (rate-based)
    def compute_radar(stats):
        total = stats.get("total_races", 0) or 1
        return {
            "winRate": round(stats.get("wins", 0) / total * 100, 1),
            "podiumRate": round(stats.get("podiums", 0) / total * 100, 1),
            "poleRate": round(stats.get("poles", 0) / total * 100, 1),
            "pointsPerRace": round(stats.get("total_points", 0) / total, 1),
            "fastestLapRate": round(stats.get("fastest_laps", 0) / total * 100, 1),
        }

    return {
        "driver1": format_driver(driver1, stats1),
        "driver2": format_driver(driver2, stats2),
        "headToHead": {
            "driver1Wins": int(head_to_head.d1_wins or 0),
            "driver2Wins": int(head_to_head.d2_wins or 0),
            "totalRaces": int(head_to_head.total or 0),
        },
        "qualifyingHeadToHead": {
            "driver1Wins": int(quali_h2h.d1_wins or 0),
            "driver2Wins": int(quali_h2h.d2_wins or 0),
            "totalRaces": int(quali_h2h.total or 0),
        },
        "teammateSeasons": teammate_seasons,
        "driver1Radar": compute_radar(stats1),
        "driver2Radar": compute_radar(stats2),
        "driver1Seasons": get_driver_season_history(driver1.id),
        "driver2Seasons": get_driver_season_history(driver2.id),
    }


@router.get("/compare/constructors")
def compare_constructors(
    c1: str, c2: str, db: Session = Depends(get_db)
):
    con1 = get_constructor_by_ref(db, c1)
    if not con1:
        raise HTTPException(
            status_code=404, detail=f"Constructor '{c1}' not found"
        )

    con2 = get_constructor_by_ref(db, c2)
    if not con2:
        raise HTTPException(
            status_code=404, detail=f"Constructor '{c2}' not found"
        )

    stats1 = get_constructor_career_stats(db, con1.id)
    stats2 = get_constructor_career_stats(db, con2.id)

    # Head-to-head: races where both constructors had a driver finish
    c1_races = (
        select(RaceResult.race_id)
        .where(RaceResult.constructor_id == con1.id)
        .subquery()
    )
    c2_races = (
        select(RaceResult.race_id)
        .where(RaceResult.constructor_id == con2.id)
        .subquery()
    )
    common_race_ids = (
        select(c1_races.c.race_id)
        .where(c1_races.c.race_id.in_(select(c2_races.c.race_id)))
        .subquery()
    )

    # Best finish per constructor per race
    r1 = RaceResult.__table__.alias("r1")
    r2 = RaceResult.__table__.alias("r2")

    # Subqueries for best position per constructor per race
    best_c1 = (
        select(
            r1.c.race_id,
            func.min(r1.c.position).label("best_pos"),
        )
        .where(
            r1.c.constructor_id == con1.id,
            r1.c.position.isnot(None),
            r1.c.race_id.in_(select(common_race_ids.c.race_id)),
        )
        .group_by(r1.c.race_id)
        .subquery()
    )
    best_c2 = (
        select(
            r2.c.race_id,
            func.min(r2.c.position).label("best_pos"),
        )
        .where(
            r2.c.constructor_id == con2.id,
            r2.c.position.isnot(None),
            r2.c.race_id.in_(select(common_race_ids.c.race_id)),
        )
        .group_by(r2.c.race_id)
        .subquery()
    )

    h2h = db.execute(
        select(
            func.count().label("total"),
            func.sum(
                case(
                    (best_c1.c.best_pos < best_c2.c.best_pos, 1),
                    else_=0,
                )
            ).label("c1_wins"),
            func.sum(
                case(
                    (best_c2.c.best_pos < best_c1.c.best_pos, 1),
                    else_=0,
                )
            ).label("c2_wins"),
        )
        .select_from(best_c1)
        .join(best_c2, best_c1.c.race_id == best_c2.c.race_id)
    ).one()

    # Season history for both constructors
    def get_constructor_season_history(constructor_id: str):
        rows = db.execute(
            select(
                Race.season_year,
                func.sum(RaceResult.points).label("points"),
            )
            .join(Race, RaceResult.race_id == Race.id)
            .where(RaceResult.constructor_id == constructor_id)
            .group_by(Race.season_year)
            .order_by(Race.season_year)
        ).all()
        return [
            {"year": r.season_year, "points": float(r.points or 0)}
            for r in rows
        ]

    def format_constructor(con: Constructor, stats: dict):
        return {
            "id": con.id,
            "ref": con.ref,
            "name": con.name,
            "nationality": con.nationality,
            "countryCode": con.country_code,
            "color": con.color,
            "logoUrl": (
                f"/logos/{con.ref}.png" if con.has_logo else None
            ),
            "stats": stats,
        }

    return {
        "constructor1": format_constructor(con1, stats1),
        "constructor2": format_constructor(con2, stats2),
        "headToHead": {
            "constructor1Wins": int(h2h.c1_wins or 0),
            "constructor2Wins": int(h2h.c2_wins or 0),
            "totalRaces": int(h2h.total or 0),
        },
        "constructor1Seasons": get_constructor_season_history(
            con1.id
        ),
        "constructor2Seasons": get_constructor_season_history(
            con2.id
        ),
    }
