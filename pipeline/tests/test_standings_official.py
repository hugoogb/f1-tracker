"""StandingsIngestor must prefer f1db's official championship points.

Until 1990 only a driver's best N results counted toward the title. Summing raw
race points therefore crowns the wrong driver in those seasons — most famously
1988, where Prost outscored Senna in total but Senna took the championship on
counted points. f1db carries the official figures, so they win over the local sum.
"""

from datetime import date
from unittest.mock import patch

import pytest

from src.db.models import (
    Circuit,
    Constructor,
    Driver,
    DriverStanding,
    Race,
    RaceResult,
    Season,
)
from src.ingestion.f1db import F1DBData
from src.ingestion.standings import StandingsIngestor


@pytest.fixture()
def season_1988(db):
    """Two rounds where Prost outscores Senna on raw points."""
    db.add(Season(year=1988))
    db.add(Circuit(id="imola", ref="imola", name="Imola"))
    db.add(Constructor(id="mclaren", ref="mclaren", name="McLaren"))
    db.add(Driver(id="ayrton-senna", ref="ayrton-senna", first_name="Ayrton", last_name="Senna"))
    db.add(Driver(id="alain-prost", ref="alain-prost", first_name="Alain", last_name="Prost"))

    for rnd in (1, 2):
        rid = f"1988_{rnd:02d}"
        db.add(
            Race(
                id=rid,
                season_year=1988,
                round=rnd,
                name=f"Round {rnd}",
                circuit_id="imola",
                date=date(1988, 4, rnd),
            )
        )
        # Senna wins both; Prost is second twice but scores more elsewhere below.
        db.add(
            RaceResult(
                id=f"{rid}_R_ayrton-senna",
                race_id=rid,
                driver_id="ayrton-senna",
                constructor_id="mclaren",
                position=1,
                points=9.0,
            )
        )
        db.add(
            RaceResult(
                id=f"{rid}_R_alain-prost",
                race_id=rid,
                driver_id="alain-prost",
                constructor_id="mclaren",
                position=2,
                points=15.0,
            )
        )
    db.commit()
    return db


def _run(db, season_payload):
    data = F1DBData({"countries": [], "grandsPrix": [], "races": [], "seasons": season_payload})
    with patch("src.ingestion.standings.f1db.load", return_value=data):
        StandingsIngestor(db).ingest()


def _standings(db):
    rows = db.query(DriverStanding).order_by(DriverStanding.position).all()
    return {r.driver_id: r for r in rows}


def test_raw_points_would_crown_the_wrong_driver(season_1988):
    """Without official standings, the higher raw scorer wins — the 1988 bug."""
    _run(season_1988, [])

    rows = _standings(season_1988)
    assert rows["alain-prost"].position == 1
    assert rows["alain-prost"].points == 30.0


def test_official_points_override_the_local_sum(season_1988):
    """f1db's official figures decide points and position."""
    _run(
        season_1988,
        [
            {
                "year": 1988,
                "driverStandings": [
                    {"positionNumber": 1, "driverId": "ayrton-senna", "points": 90},
                    {"positionNumber": 2, "driverId": "alain-prost", "points": 87},
                ],
                "constructorStandings": [],
            }
        ],
    )

    rows = _standings(season_1988)
    assert rows["ayrton-senna"].position == 1
    assert rows["ayrton-senna"].points == 90.0
    assert rows["alain-prost"].position == 2
    assert rows["alain-prost"].points == 87.0


def test_wins_are_still_counted_locally(season_1988):
    """f1db standings omit wins, so the locally counted value must survive."""
    _run(
        season_1988,
        [
            {
                "year": 1988,
                "driverStandings": [
                    {"positionNumber": 1, "driverId": "ayrton-senna", "points": 90},
                    {"positionNumber": 2, "driverId": "alain-prost", "points": 87},
                ],
                "constructorStandings": [],
            }
        ],
    )

    rows = _standings(season_1988)
    assert rows["ayrton-senna"].wins == 2
    assert rows["alain-prost"].wins == 0


def test_season_without_official_standings_keeps_computed_values(season_1988):
    """A season f1db has no standings for falls back to the local computation."""
    _run(season_1988, [{"year": 1988, "driverStandings": [], "constructorStandings": []}])

    rows = _standings(season_1988)
    assert rows["alain-prost"].position == 1
    assert rows["alain-prost"].points == 30.0
