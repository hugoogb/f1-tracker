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
    ConstructorStanding,
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


def _constructor_season(db, year, constructors):
    """One race where each constructor scores, so each gets a computed standing."""
    db.add(Season(year=year))
    db.add(Circuit(id=f"c{year}", ref=f"c{year}", name="Circuit"))
    rid = f"{year}_01"
    db.add(
        Race(
            id=rid,
            season_year=year,
            round=1,
            name="Round 1",
            circuit_id=f"c{year}",
            date=date(year, 5, 1),
        )
    )
    for i, (cid, points) in enumerate(constructors, 1):
        db.add(Constructor(id=cid, ref=cid, name=cid))
        db.add(Driver(id=f"d-{cid}", ref=f"d-{cid}", first_name="A", last_name=cid))
        db.add(
            RaceResult(
                id=f"{rid}_R_{cid}",
                race_id=rid,
                driver_id=f"d-{cid}",
                constructor_id=cid,
                position=i,
                points=points,
            )
        )
    db.commit()
    return rid


def _official(year, constructor_rows, driver_rows=()):
    return F1DBData(
        {
            "countries": [],
            "grandsPrix": [],
            "races": [],
            "seasons": [
                {
                    "year": year,
                    "driverStandings": list(driver_rows),
                    "constructorStandings": list(constructor_rows),
                }
            ],
        }
    )


def _ingest(db, data):
    with patch("src.ingestion.standings.f1db.load", return_value=data):
        StandingsIngestor(db).ingest()


def _ctor(db, rid, cid):
    return db.get(ConstructorStanding, f"{rid}_CS_{cid}")


def test_a_constructor_with_two_engines_keeps_its_best_row(db):
    """Cooper-Climax won 1960; a Cooper-Maserati on 3 points must not replace it."""
    rid = _constructor_season(db, 1960, [("cooper", 40), ("lotus", 30)])
    _ingest(
        db,
        _official(
            1960,
            [
                {"positionNumber": 1, "constructorId": "cooper", "points": 48},
                {"positionNumber": 2, "constructorId": "lotus", "points": 34},
                {"positionNumber": 5, "constructorId": "cooper", "points": 3},
            ],
        ),
    )
    assert (_ctor(db, rid, "cooper").position, _ctor(db, rid, "cooper").points) == (1, 48)


def test_the_order_of_a_constructors_rows_does_not_matter(db):
    rid = _constructor_season(db, 1960, [("cooper", 40)])
    _ingest(
        db,
        _official(
            1960,
            [
                {"positionNumber": 5, "constructorId": "cooper", "points": 3},
                {"positionNumber": None, "constructorId": "cooper", "points": 0},
                {"positionNumber": 1, "constructorId": "cooper", "points": 48},
            ],
        ),
    )
    assert _ctor(db, rid, "cooper").position == 1


def test_an_excluded_constructor_has_no_position(db):
    """McLaren scored the most in 2007 and was excluded; only Ferrari is P1."""
    rid = _constructor_season(db, 2007, [("mclaren", 218), ("ferrari", 204)])
    _ingest(
        db,
        _official(
            2007,
            [
                {"positionNumber": 1, "constructorId": "ferrari", "points": 204},
                {"positionNumber": None, "constructorId": "mclaren", "points": 0},
            ],
        ),
    )
    assert _ctor(db, rid, "mclaren").position is None
    assert _ctor(db, rid, "ferrari").position == 1


def test_a_disqualified_driver_has_no_position(db):
    """Schumacher, 1997: disqualified, and not second on summed points."""
    rid = _constructor_season(db, 1997, [("williams", 81), ("ferrari", 78)])
    _ingest(
        db,
        _official(
            1997,
            [],
            [
                {"positionNumber": 1, "driverId": "d-williams", "points": 81},
                {"positionNumber": None, "driverId": "d-ferrari", "points": 78},
            ],
        ),
    )
    assert db.get(DriverStanding, f"{rid}_DS_d-ferrari").position is None
    assert db.get(DriverStanding, f"{rid}_DS_d-williams").position == 1


def test_an_entry_the_table_omits_sits_below_it(db):
    """Watson won at Indianapolis in 1960, which never counted for constructors."""
    rid = _constructor_season(db, 1960, [("watson", 90), ("cooper", 40), ("lotus", 30)])
    _ingest(
        db,
        _official(
            1960,
            [
                {"positionNumber": 1, "constructorId": "cooper", "points": 48},
                {"positionNumber": 2, "constructorId": "lotus", "points": 34},
            ],
        ),
    )
    assert _ctor(db, rid, "watson").position == 3


def test_a_round_table_keeps_a_constructors_best_row(db):
    rid = _constructor_season(db, 1960, [("cooper", 40)])
    db.add(
        Race(
            id="1960_02",
            season_year=1960,
            round=2,
            name="R2",
            circuit_id="c1960",
            date=date(1960, 6, 1),
        )
    )
    db.add(
        RaceResult(
            id="1960_02_R",
            race_id="1960_02",
            driver_id="d-cooper",
            constructor_id="cooper",
            position=1,
            points=8,
        )
    )
    db.commit()
    data = F1DBData(
        {
            "countries": [],
            "grandsPrix": [],
            "seasons": [],
            "races": [
                {
                    "year": 1960,
                    "round": 1,
                    "driverStandings": [],
                    "constructorStandings": [
                        {"positionNumber": 1, "constructorId": "cooper", "points": 14},
                        {"positionNumber": 4, "constructorId": "cooper", "points": 3},
                    ],
                }
            ],
        }
    )
    _ingest(db, data)
    assert (_ctor(db, rid, "cooper").position, _ctor(db, rid, "cooper").points) == (1, 14)
