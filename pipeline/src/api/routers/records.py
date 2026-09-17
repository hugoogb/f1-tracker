from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import Float, cast, func, select
from sqlalchemy.orm import Session
from sqlalchemy.sql import Subquery

from src.api.constants import (
    DEFAULT_EXPLORE_LIMIT,
    DEFAULT_EXPLORE_MIN_STARTS,
    DEFAULT_RECORD_LIMIT,
    MAX_RECORD_LIMIT,
)
from src.api.pagination import paginate_rows
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
from src.scoring import SYSTEMS, era_bounds

router = APIRouter()


def _final_round_race_ids() -> Subquery:
    """The race that closed each season — where the championship was decided.

    Titles are read off the standings at that race, which carry f1db's official
    points. They are never re-derived from race results: until 1990 only part of
    a driver's record counted, so a sum of races crowns the wrong champion.
    """
    last_rounds = (
        select(
            Race.season_year,
            func.max(Race.round).label("max_round"),
        )
        .group_by(Race.season_year)
        .subquery()
    )
    return (
        select(Race.id)
        .join(
            last_rounds,
            (Race.season_year == last_rounds.c.season_year)
            & (Race.round == last_rounds.c.max_round),
        )
        .subquery()
    )


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
    last_race_ids = _final_round_race_ids()
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


# --- Records explorer ---------------------------------------------------------
#
# The curated tables above answer "who holds the record". The explorer answers
# "who held it between these years, in this category, among drivers of this
# nationality" — the same data, sliced. It is a separate endpoint rather than a
# parameterised /records because the curated page is the cached, indexed landing
# content and must keep returning the same shape.

ExploreEntity = Literal["driver", "constructor"]
ExploreCategory = Literal[
    "wins",
    "poles",
    "podiums",
    "fastest_laps",
    "starts",
    "championships",
    "points",
    "win_rate",
    "podium_rate",
]

# Categories whose value is a ratio, and so need a denominator floor.
_RATE_CATEGORIES = frozenset({"win_rate", "podium_rate"})

# category -> (label, how the frontend should format the value)
_CATEGORY_META: dict[str, tuple[str, str]] = {
    "wins": ("Wins", "integer"),
    "poles": ("Poles", "integer"),
    "podiums": ("Podiums", "integer"),
    "fastest_laps": ("Fastest laps", "integer"),
    "starts": ("Starts", "integer"),
    "championships": ("Championships", "integer"),
    "points": ("Points scored", "decimal"),
    "win_rate": ("Win rate", "percent"),
    "podium_rate": ("Podium rate", "percent"),
}


def _starts_subquery(entity: str, year_clauses: list) -> Subquery:
    """How many times each competitor lined up, within the year range.

    For a constructor this counts car entries rather than races, because that is
    the denominator its wins and podiums are drawn from — a two-car team can
    take two podiums from one race, and a rate over races could then exceed
    100%. It is labelled "entries" everywhere it surfaces.
    """
    column = RaceResult.driver_id if entity == "driver" else RaceResult.constructor_id
    return (
        select(column.label("entity_id"), func.count().label("starts"))
        .join(Race, RaceResult.race_id == Race.id)
        .where(*year_clauses)
        .group_by(column)
        .subquery()
    )


def _metric_subquery(entity: str, category: str, year_clauses: list) -> Subquery:
    """entity_id -> the raw count (or sum) behind one category.

    Every branch filters on `races.season_year`, the season a result belongs to,
    rather than on a race date — a championship is a fact about a season.
    """
    is_driver = entity == "driver"
    result_column = RaceResult.driver_id if is_driver else RaceResult.constructor_id

    def from_results(agg, *extra) -> Subquery:
        return (
            select(result_column.label("entity_id"), agg.label("metric"))
            .join(Race, RaceResult.race_id == Race.id)
            .where(*year_clauses, *extra)
            .group_by(result_column)
            .subquery()
        )

    if category in ("wins", "win_rate"):
        return from_results(func.count(), RaceResult.position == 1)
    if category in ("podiums", "podium_rate"):
        return from_results(func.count(), RaceResult.position <= 3)
    if category == "points":
        return from_results(func.coalesce(func.sum(RaceResult.points), 0.0))
    if category == "poles":
        quali_column = QualifyingResult.driver_id if is_driver else QualifyingResult.constructor_id
        return (
            select(quali_column.label("entity_id"), func.count().label("metric"))
            .join(Race, QualifyingResult.race_id == Race.id)
            .where(*year_clauses, QualifyingResult.position == 1)
            .group_by(quali_column)
            .subquery()
        )
    if category == "fastest_laps":
        lap_column = Race.fastest_lap_driver_id if is_driver else Race.fastest_lap_constructor_id
        return (
            select(lap_column.label("entity_id"), func.count().label("metric"))
            .where(*year_clauses, lap_column.isnot(None))
            .group_by(lap_column)
            .subquery()
        )

    # Championships. Read off the official standings after the season's final
    # round, never from a sum of race points — see `_final_round_race_ids`.
    standing = DriverStanding if is_driver else ConstructorStanding
    standing_column = standing.driver_id if is_driver else standing.constructor_id
    return (
        select(standing_column.label("entity_id"), func.count().label("metric"))
        .join(Race, standing.race_id == Race.id)
        .where(
            *year_clauses,
            standing.position == 1,
            standing.race_id.in_(select(_final_round_race_ids())),
        )
        .group_by(standing_column)
        .subquery()
    )


def _explore_note(entity: str, category: str, min_starts: int) -> str:
    """What the column actually means, in one sentence the UI can print."""
    denominator = "race starts" if entity == "driver" else "car entries"
    if category == "championships":
        return (
            "Titles come from the official standings after each season's final round, which "
            "carry f1db's own points. They are never re-derived from race results: until 1990 "
            "only part of a competitor's record counted towards the championship."
        )
    if category == "points":
        return (
            "Points scored in races, under whichever system was in force at the time — a win "
            "has been worth 8, 9, 10 and 25 points. Before 1991 a championship total was not "
            "the sum of a season's races, so this is a career tally and not a title-winning one."
        )
    if category in _RATE_CATEGORIES:
        measure = "Wins" if category == "win_rate" else "Podium finishes"
        return (
            f"{measure} as a share of {denominator}, counting only competitors with at least "
            f"{min_starts} of them. Without that floor a single start and a single win would "
            "top the table."
        )
    if entity == "constructor":
        return "A constructor's entries count each car, so a two-car team enters twice per race."
    return "Counted from race results across the selected seasons."


@router.get("/records/explore")
def explore_records(
    entity: ExploreEntity = Query(..., description="Whose records to rank"),
    category: ExploreCategory = Query("wins", description="What to rank them by"),
    era: str | None = Query(
        None,
        description=(
            "A points-system id from /api/points-systems, used as a shorthand for the seasons "
            "it was in force. Mutually exclusive with year_from/year_to."
        ),
    ),
    year_from: int | None = Query(None, ge=1950, description="First season, inclusive"),
    year_to: int | None = Query(None, ge=1950, description="Last season, inclusive"),
    nationality: str | None = Query(
        None, description="Driver nationality, from /api/drivers/nationalities"
    ),
    country: str | None = Query(
        None, description="Constructor nationality, from /api/constructors/nationalities"
    ),
    min_starts: int | None = Query(
        None, ge=0, description="Minimum starts (drivers) or entries (constructors)"
    ),
    sort: Literal["asc", "desc"] = Query("desc"),
    page: int = Query(1, ge=1),
    limit: int = Query(DEFAULT_EXPLORE_LIMIT, ge=1, le=MAX_RECORD_LIMIT),
    db: Session = Depends(get_db),
):
    """A filterable, sortable view of the same records the curated tables show.

    The eras on offer are the points-system changes in `src/scoring.py`, because
    those are a documented fact about the sport rather than an invented boundary.
    Passing `era` is exactly equivalent to passing that system's year range.
    """
    era_system = None
    if era is not None:
        if year_from is not None or year_to is not None:
            raise HTTPException(
                status_code=400,
                detail="Pass either era or a year_from/year_to range, not both.",
            )
        era_system = SYSTEMS.get(era)
        if era_system is None:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown era '{era}'. The ids come from /api/points-systems.",
            )
        year_from, year_to = era_bounds(era_system.id)

    if year_from is not None and year_to is not None and year_from > year_to:
        raise HTTPException(status_code=400, detail="year_from must not be later than year_to.")

    year_clauses = []
    if year_from is not None:
        year_clauses.append(Race.season_year >= year_from)
    if year_to is not None:
        year_clauses.append(Race.season_year <= year_to)

    is_rate = category in _RATE_CATEGORIES
    if min_starts is None:
        effective_min_starts = DEFAULT_EXPLORE_MIN_STARTS if is_rate else 0
    else:
        effective_min_starts = min_starts
    if is_rate:
        # The denominator is the only thing that can be zero here, and a rate
        # table with one-start wonders at the top is worse than useless.
        effective_min_starts = max(effective_min_starts, 1)

    model = Driver if entity == "driver" else Constructor
    starts_sq = _starts_subquery(entity, year_clauses)

    if category == "starts":
        entity_id_expr = starts_sq.c.entity_id
        starts_expr = starts_sq.c.starts
        value_expr = starts_sq.c.starts
        source = starts_sq
    elif is_rate:
        metric_sq = _metric_subquery(entity, category, year_clauses)
        entity_id_expr = starts_sq.c.entity_id
        starts_expr = starts_sq.c.starts
        # starts_sq only produces rows for competitors with at least one start,
        # so the divisor is never zero.
        value_expr = cast(func.coalesce(metric_sq.c.metric, 0), Float) / cast(
            starts_sq.c.starts, Float
        )
        source = starts_sq.outerjoin(metric_sq, starts_sq.c.entity_id == metric_sq.c.entity_id)
    else:
        metric_sq = _metric_subquery(entity, category, year_clauses)
        entity_id_expr = metric_sq.c.entity_id
        starts_expr = func.coalesce(starts_sq.c.starts, 0)
        value_expr = metric_sq.c.metric
        source = metric_sq.outerjoin(starts_sq, metric_sq.c.entity_id == starts_sq.c.entity_id)

    source = source.join(model, model.id == entity_id_expr)

    filters = []
    if effective_min_starts > 0:
        filters.append(starts_expr >= effective_min_starts)
    if entity == "driver" and nationality:
        filters.append(Driver.nationality.ilike(nationality))
    if entity == "constructor" and country:
        filters.append(Constructor.nationality.ilike(country))

    value_col = value_expr.label("value")
    starts_col = starts_expr.label("starts")
    name_column = Driver.last_name if entity == "driver" else Constructor.name
    ordered = (
        [value_col.asc(), starts_col.asc()]
        if sort == "asc"
        else [value_col.desc(), starts_col.desc()]
    )

    query = (
        select(model, value_col, starts_col)
        .select_from(source)
        .where(*filters)
        .order_by(*ordered, name_column.asc())
    )
    count_query = select(func.count()).select_from(source).where(*filters)

    key = "driver" if entity == "driver" else "constructor"
    summarise = driver_summary if entity == "driver" else constructor_summary

    def serialize(row: Any, rank: int) -> dict:
        raw = float(row.value or 0)
        if is_rate:
            value: float | int = round(raw, 4)
        elif category == "points":
            value = round(raw, 2)
        else:
            value = int(raw)
        return {
            "rank": rank,
            key: summarise(row[0]),
            "value": value,
            "starts": int(row.starts or 0),
        }

    label, value_format = _CATEGORY_META[category]
    if category == "starts" and entity == "constructor":
        label = "Entries"

    return {
        "entity": entity,
        "category": category,
        "label": label,
        "format": value_format,
        "era": (
            {"id": era_system.id, "label": era_system.label, "era": era_system.era}
            if era_system
            else None
        ),
        "yearFrom": year_from,
        "yearTo": year_to,
        "nationality": nationality if entity == "driver" else country,
        "minStarts": effective_min_starts,
        "sort": sort,
        "note": _explore_note(entity, category, effective_min_starts),
        **paginate_rows(db, query, count_query, page, limit, serialize),
    }
