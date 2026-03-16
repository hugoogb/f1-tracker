from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.api.constants import DEFAULT_RECORD_LIMIT, MAX_RECORD_LIMIT
from src.api.serializers import constructor_summary, driver_summary
from src.db.database import get_db
from src.db.models import (
    Constructor,
    ConstructorStanding,
    Driver,
    DriverStanding,
    QualifyingResult,
    Race,
    RaceResult,
)

router = APIRouter()


@router.get("/records")
def get_records(
    limit: int = Query(DEFAULT_RECORD_LIMIT, ge=1, le=MAX_RECORD_LIMIT),
    db: Session = Depends(get_db),
):
    # --- Driver Records ---

    # Most wins
    most_wins = db.execute(
        select(RaceResult.driver_id, func.count().label("count"))
        .where(RaceResult.position == 1)
        .group_by(RaceResult.driver_id)
        .order_by(func.count().desc())
        .limit(limit)
    ).all()

    # Most podiums
    most_podiums = db.execute(
        select(RaceResult.driver_id, func.count().label("count"))
        .where(RaceResult.position <= 3)
        .group_by(RaceResult.driver_id)
        .order_by(func.count().desc())
        .limit(limit)
    ).all()

    # Most poles
    most_poles = db.execute(
        select(
            QualifyingResult.driver_id,
            func.count().label("count"),
        )
        .where(QualifyingResult.position == 1)
        .group_by(QualifyingResult.driver_id)
        .order_by(func.count().desc())
        .limit(limit)
    ).all()

    # Most race starts
    most_starts = db.execute(
        select(RaceResult.driver_id, func.count().label("count"))
        .group_by(RaceResult.driver_id)
        .order_by(func.count().desc())
        .limit(limit)
    ).all()

    # Most championships
    last_rounds = (
        select(
            Race.season_year,
            func.max(Race.round).label("max_round"),
        )
        .group_by(Race.season_year)
        .subquery()
    )
    last_race_ids = (
        select(Race.id)
        .join(
            last_rounds,
            (Race.season_year == last_rounds.c.season_year)
            & (Race.round == last_rounds.c.max_round),
        )
        .subquery()
    )
    most_championships = db.execute(
        select(
            DriverStanding.driver_id,
            func.count().label("count"),
        )
        .where(
            DriverStanding.position == 1,
            DriverStanding.race_id.in_(select(last_race_ids)),
        )
        .group_by(DriverStanding.driver_id)
        .order_by(func.count().desc())
        .limit(limit)
    ).all()

    # Most fastest laps
    most_fastest_laps = db.execute(
        select(
            Race.fastest_lap_driver_id,
            func.count().label("count"),
        )
        .where(Race.fastest_lap_driver_id.isnot(None))
        .group_by(Race.fastest_lap_driver_id)
        .order_by(func.count().desc())
        .limit(limit)
    ).all()

    # --- Constructor Records ---

    # Most constructor wins
    constructor_wins = db.execute(
        select(RaceResult.constructor_id, func.count().label("count"))
        .where(RaceResult.position == 1)
        .group_by(RaceResult.constructor_id)
        .order_by(func.count().desc())
        .limit(limit)
    ).all()

    # Most constructor championships
    most_constructor_champs = db.execute(
        select(
            ConstructorStanding.constructor_id,
            func.count().label("count"),
        )
        .where(
            ConstructorStanding.position == 1,
            ConstructorStanding.race_id.in_(select(last_race_ids)),
        )
        .group_by(ConstructorStanding.constructor_id)
        .order_by(func.count().desc())
        .limit(limit)
    ).all()

    # Bulk-fetch all referenced drivers and constructors in 2 queries
    all_driver_ids = set()
    for rows in [most_wins, most_podiums, most_poles, most_starts, most_championships]:
        for row in rows:
            all_driver_ids.add(row.driver_id)
    for row in most_fastest_laps:
        all_driver_ids.add(row.fastest_lap_driver_id)

    all_constructor_ids = set()
    for rows in [constructor_wins, most_constructor_champs]:
        for row in rows:
            all_constructor_ids.add(row.constructor_id)

    driver_map = {}
    if all_driver_ids:
        drivers = db.execute(select(Driver).where(Driver.id.in_(all_driver_ids))).scalars().all()
        driver_map = {d.id: d for d in drivers}

    constructor_map = {}
    if all_constructor_ids:
        constructors = (
            db.execute(select(Constructor).where(Constructor.id.in_(all_constructor_ids)))
            .scalars()
            .all()
        )
        constructor_map = {c.id: c for c in constructors}

    def _resolve_driver(rows):
        return [
            {"driver": driver_summary(driver_map[row.driver_id]), "count": row.count}
            for row in rows
            if row.driver_id in driver_map
        ]

    def _resolve_fastest_lap_driver(rows):
        return [
            {
                "driver": driver_summary(driver_map[row.fastest_lap_driver_id]),
                "count": row.count,
            }
            for row in rows
            if row.fastest_lap_driver_id in driver_map
        ]

    def _resolve_constructor(rows):
        return [
            {
                "constructor": constructor_summary(constructor_map[row.constructor_id]),
                "count": row.count,
            }
            for row in rows
            if row.constructor_id in constructor_map
        ]

    return {
        "drivers": {
            "mostWins": _resolve_driver(most_wins),
            "mostPodiums": _resolve_driver(most_podiums),
            "mostPoles": _resolve_driver(most_poles),
            "mostStarts": _resolve_driver(most_starts),
            "mostChampionships": _resolve_driver(most_championships),
            "mostFastestLaps": _resolve_fastest_lap_driver(most_fastest_laps),
        },
        "constructors": {
            "mostWins": _resolve_constructor(constructor_wins),
            "mostChampionships": _resolve_constructor(most_constructor_champs),
        },
    }
