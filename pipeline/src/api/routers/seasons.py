from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.api.serializers import constructor_compact, driver_summary, race_schedule
from src.db.database import get_db
from src.db.models import (
    CircuitLayout,
    Driver,
    DriverStanding,
    Race,
    RaceResult,
    SprintResult,
)
from src.db.queries import (
    get_all_seasons,
    get_driver_standings_for_season,
    get_season_races,
)
from src.geo import great_circle_km, layout_active_in
from src.scoring import counts_every_result, system_for_year

router = APIRouter()

# Floating-point points totals (half points, shared drives) never land exactly,
# so a difference this small is rounding rather than a dropped score.
_POINTS_EPSILON = 0.01


def _season_scoring(db: Session, year: int, races: list[Race]) -> dict:
    """How the season was scored, and what that cost anyone.

    The points system is a fact about the year. Whether results were dropped is
    read off the data rather than from a table of rules: some form of "best N
    results" applied from 1950 to 1990, but the N changed almost every season —
    and some years split the calendar into halves scored separately — and none
    of that is in the f1db dataset.

    What the data does carry is the consequence. A driver whose championship
    total is lower than the points they actually scored dropped the difference,
    and that subtraction is the part worth showing: in 1988 Prost scored 105 and
    kept 87, which is exactly why he lost a title he had outscored Senna in.
    """
    system = system_for_year(year)
    scoring = {
        "system": {
            "id": system.id,
            "label": system.label,
            "era": system.era,
            "notes": system.notes,
            "fastestLapPoint": system.fastest_lap_point,
        },
        "everyResultCounts": counts_every_result(year),
        "droppedPoints": None,
    }

    standings = get_driver_standings_for_season(db, year)
    if not races or not standings:
        return scoring

    race_ids = [r.id for r in races]
    scored: dict[str, float] = defaultdict(float)
    for model in (RaceResult, SprintResult):
        rows = db.execute(
            select(model.driver_id, func.sum(model.points))
            .where(model.race_id.in_(race_ids))
            .group_by(model.driver_id)
        ).all()
        for driver_id, total in rows:
            scored[driver_id] += float(total or 0)

    drops = [
        (scored[s.driver_id] - s.points, s)
        for s in standings
        if scored.get(s.driver_id, 0.0) - s.points > _POINTS_EPSILON
    ]
    if not drops:
        return scoring

    largest, standing = max(drops, key=lambda pair: pair[0])
    driver = db.get(Driver, standing.driver_id)
    scoring["droppedPoints"] = {
        "driversAffected": len(drops),
        "largest": {
            "driver": driver_summary(driver) if driver else None,
            "scored": round(scored[standing.driver_id], 2),
            "counted": round(standing.points, 2),
            "dropped": round(largest, 2),
        },
    }
    return scoring


@router.get("/seasons")
def list_seasons(db: Session = Depends(get_db)):
    seasons = get_all_seasons(db)
    return {"data": [{"year": s.year} for s in seasons]}


@router.get("/seasons/{year}")
def get_season(year: int, db: Session = Depends(get_db)):
    races = get_season_races(db, year)
    return {
        "year": year,
        "scoring": _season_scoring(db, year, races),
        "races": [
            {
                "id": r.id,
                "round": r.round,
                "name": r.name,
                "date": str(r.date) if r.date else None,
                "schedule": race_schedule(r),
                "circuit": {
                    "id": r.circuit.id,
                    "ref": r.circuit.ref,
                    "name": r.circuit.name,
                    "location": r.circuit.location,
                    "country": r.circuit.country,
                    "countryCode": r.circuit.country_code,
                },
            }
            for r in races
        ],
    }


@router.get("/seasons/{year}/calendar")
def get_season_calendar(year: int, db: Session = Depends(get_db)):
    """The season as a journey: every round's circuit, where it is, and who won.

    Feeds the calendar world map. Each round carries `legKm`, the great-circle
    distance from the previous round's circuit (null for round 1, or when either
    end has no coordinates), and `totalKm` is their sum — the same haversine the
    map uses to draw the arcs, so the figure and the lines agree.

    The winner is the classified P1 of the race, null for a race not yet run.
    Shared drives in the 1950s can classify two drivers first; the one who
    started the car (lower grid slot, then driver id) is reported.
    """
    races = get_season_races(db, year)
    if not races:
        raise HTTPException(status_code=404, detail="Season not found")

    race_ids = [r.id for r in races]
    winners: dict[str, RaceResult] = {}
    rows = (
        db.execute(
            select(RaceResult)
            .where(RaceResult.race_id.in_(race_ids), RaceResult.position == 1)
            .order_by(RaceResult.grid.is_(None), RaceResult.grid, RaceResult.driver_id)
        )
        .scalars()
        .all()
    )
    for row in rows:
        winners.setdefault(row.race_id, row)

    circuit_ids = {r.circuit_id for r in races}
    layouts_by_circuit: dict[str, list[CircuitLayout]] = defaultdict(list)
    for layout in (
        db.execute(
            select(CircuitLayout)
            .where(CircuitLayout.circuit_id.in_(circuit_ids))
            .order_by(CircuitLayout.layout_number)
        )
        .scalars()
        .all()
    ):
        layouts_by_circuit[layout.circuit_id].append(layout)

    def layout_svg(circuit_id: str) -> str | None:
        layouts = layouts_by_circuit.get(circuit_id, [])
        for layout in layouts:
            if layout_active_in(layout.seasons_active, year):
                return layout.svg_id
        return None

    rounds = []
    total_km = 0.0
    previous = None
    for race in races:
        circuit = race.circuit
        leg_km = None
        if (
            previous is not None
            and previous.latitude is not None
            and previous.longitude is not None
            and circuit.latitude is not None
            and circuit.longitude is not None
        ):
            leg_km = great_circle_km(
                previous.latitude, previous.longitude, circuit.latitude, circuit.longitude
            )
            total_km += leg_km
        previous = circuit

        winner = winners.get(race.id)
        rounds.append(
            {
                "round": race.round,
                "name": race.name,
                "date": str(race.date) if race.date else None,
                "schedule": race_schedule(race),
                "circuit": {
                    "ref": circuit.ref,
                    "name": circuit.name,
                    "location": circuit.location,
                    "country": circuit.country,
                    "countryCode": circuit.country_code,
                    "latitude": circuit.latitude,
                    "longitude": circuit.longitude,
                    "layoutSvgId": layout_svg(circuit.id),
                },
                "winner": {
                    "driver": {
                        "ref": winner.driver.ref,
                        "code": winner.driver.code,
                        "firstName": winner.driver.first_name,
                        "lastName": winner.driver.last_name,
                    },
                    "constructor": constructor_compact(winner.constructor)
                    if winner.constructor
                    else None,
                }
                if winner
                else None,
                "legKm": round(leg_km, 1) if leg_km is not None else None,
            }
        )

    return {"year": year, "totalKm": round(total_km, 1), "rounds": rounds}


@router.get("/seasons/{year}/heatmap")
def get_season_heatmap(year: int, db: Session = Depends(get_db)):
    races = get_season_races(db, year)
    if not races:
        raise HTTPException(status_code=404, detail="Season not found")

    race_ids = [r.id for r in races]
    race_round_map = {r.id: r.round for r in races}

    # Fetch all race results for the season in one query
    all_results = (
        db.execute(select(RaceResult).where(RaceResult.race_id.in_(race_ids))).scalars().all()
    )

    # Get final standings to determine driver order
    last_race = races[-1]
    standings = (
        db.execute(
            select(DriverStanding)
            .where(DriverStanding.race_id == last_race.id)
            .order_by(DriverStanding.position)
        )
        .scalars()
        .all()
    )

    # Build driver order from standings
    driver_order = [s.driver_id for s in standings]

    # Build lookup: driver_id -> {round -> result}
    driver_results: dict[int, dict[int, RaceResult]] = defaultdict(dict)
    driver_constructor: dict[int, object] = {}
    for r in all_results:
        rnd = race_round_map[r.race_id]
        driver_results[r.driver_id][rnd] = r
        driver_constructor[r.driver_id] = r.constructor  # Last one wins

    # Include drivers not in standings (e.g., mid-season entries)
    for driver_id in driver_results:
        if driver_id not in driver_order:
            driver_order.append(driver_id)

    # Build response
    drivers_data = []
    for driver_id in driver_order:
        results_by_round = driver_results.get(driver_id, {})
        if not results_by_round:
            continue

        # Get driver info from any result
        sample_result = next(iter(results_by_round.values()))
        constructor = driver_constructor.get(driver_id)

        drivers_data.append(
            {
                "driver": {
                    "ref": sample_result.driver.ref,
                    "code": sample_result.driver.code,
                    "firstName": sample_result.driver.first_name,
                    "lastName": sample_result.driver.last_name,
                },
                "constructor": {
                    "ref": constructor.ref if constructor else None,
                    "name": constructor.name if constructor else None,
                    "color": constructor.color if constructor else None,
                },
                "results": [
                    {
                        "round": rnd,
                        "position": r.position,
                        "positionText": r.position_text,
                        "points": r.points,
                        "status": r.status.description if r.status else None,
                    }
                    for rnd, r in sorted(results_by_round.items())
                ],
            }
        )

    return {
        "year": year,
        "rounds": [{"round": r.round, "name": r.name} for r in races],
        "drivers": drivers_data,
    }
