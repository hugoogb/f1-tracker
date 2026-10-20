import datetime

import pytest

from src.db.models import Circuit, CircuitLayout, Race, RaceResult
from src.geo import great_circle_km, layout_active_in


def test_great_circle_zero_for_same_point():
    assert great_circle_km(45.0, 9.0, 45.0, 9.0) == pytest.approx(0.0)


def test_great_circle_known_distance():
    # London Heathrow to New York JFK is ~5,540 km great-circle.
    assert great_circle_km(51.47, -0.4543, 40.6413, -73.7781) == pytest.approx(5540, rel=0.01)


def test_great_circle_antipodes_is_half_circumference():
    assert great_circle_km(0, 0, 0, 180) == pytest.approx(20015, rel=0.001)


@pytest.mark.parametrize(
    ("seasons", "year", "expected"),
    [
        ("1976-1979,1981-1999", 1977, True),
        ("1976-1979,1981-1999", 1980, False),
        ("1976-1979,1981-1999", 1999, True),
        ("2000", 2000, True),
        ("2000", 2001, False),
        ("garbage", 2000, False),
        ("", 2000, False),
    ],
)
def test_layout_active_in(seasons, year, expected):
    assert layout_active_in(seasons, year) is expected


def test_calendar_404_for_unknown_season(client):
    response = client.get("/api/seasons/1900/calendar")
    assert response.status_code == 404


@pytest.fixture()
def calendar_data(race_seed_data, db):
    """A second, unraced round at Silverstone, after Monza's round 1."""
    silverstone = Circuit(
        id="circuit-2",
        ref="silverstone",
        name="Silverstone Circuit",
        location="Silverstone",
        country="United Kingdom",
        country_code="GB",
        latitude=52.0786,
        longitude=-1.0169,
    )
    db.add_all(
        [
            silverstone,
            CircuitLayout(
                id="layout-3",
                circuit_id="circuit-2",
                layout_number=8,
                svg_id="silverstone-8",
                seasons_active="2010-2026",
            ),
            Race(
                id="race-2",
                season_year=2023,
                round=2,
                name="British Grand Prix",
                circuit_id="circuit-2",
                date=datetime.date(2023, 7, 9),
                time=datetime.time(14, 0),
            ),
        ]
    )
    db.commit()
    return race_seed_data


def test_calendar_rounds_in_order_with_coordinates(client, calendar_data):
    response = client.get("/api/seasons/2023/calendar")
    assert response.status_code == 200
    data = response.json()
    assert data["year"] == 2023
    assert [r["round"] for r in data["rounds"]] == [1, 2]

    first, second = data["rounds"]
    assert first["circuit"]["ref"] == "monza"
    assert first["circuit"]["latitude"] == pytest.approx(45.6156)
    assert first["circuit"]["longitude"] == pytest.approx(9.2811)
    assert first["circuit"]["country"] == "Italy"
    assert first["circuit"]["countryCode"] == "IT"
    assert first["circuit"]["location"] == "Monza"
    assert first["date"] == "2023-03-05"
    assert second["schedule"]["race"] == "2023-07-09T14:00:00Z"


def test_calendar_picks_the_layout_active_that_year(client, calendar_data):
    rounds = client.get("/api/seasons/2023/calendar").json()["rounds"]
    # Monza has two layouts in the fixture; only monza-7 covers 2023.
    assert rounds[0]["circuit"]["layoutSvgId"] == "monza-7"
    assert rounds[1]["circuit"]["layoutSvgId"] == "silverstone-8"


def test_calendar_winner_for_raced_round_and_null_for_future(client, calendar_data):
    rounds = client.get("/api/seasons/2023/calendar").json()["rounds"]
    winner = rounds[0]["winner"]
    assert winner["driver"]["ref"] == "max_verstappen"
    assert winner["driver"]["lastName"] == "Verstappen"
    assert winner["constructor"]["ref"] == "red_bull"
    assert winner["constructor"]["color"] == "#3671C6"
    assert rounds[1]["winner"] is None


def test_calendar_shared_drive_reports_the_starting_driver(client, calendar_data, db):
    # Two classified winners for one race (a 1950s shared drive): the one who
    # started the car, i.e. the lower grid slot, is reported.
    co_driver = db.get(RaceResult, "result-2")
    co_driver.position = 1
    co_driver.position_text = "1"
    db.commit()
    winner = client.get("/api/seasons/2023/calendar").json()["rounds"][0]["winner"]
    assert winner["driver"]["ref"] == "max_verstappen"


def test_calendar_leg_and_total_distance(client, calendar_data):
    data = client.get("/api/seasons/2023/calendar").json()
    first, second = data["rounds"]
    assert first["legKm"] is None
    expected = great_circle_km(45.6156, 9.2811, 52.0786, -1.0169)
    assert second["legKm"] == pytest.approx(expected, abs=0.1)
    # Monza to Silverstone is roughly 1,000 km as the crow flies.
    assert 950 < second["legKm"] < 1050
    assert data["totalKm"] == pytest.approx(expected, abs=0.1)


def test_calendar_leg_skipped_when_coordinates_missing(client, calendar_data, db):
    circuit = db.get(Circuit, "circuit-2")
    circuit.latitude = None
    circuit.longitude = None
    db.commit()
    data = client.get("/api/seasons/2023/calendar").json()
    assert data["rounds"][1]["legKm"] is None
    assert data["rounds"][1]["circuit"]["latitude"] is None
    assert data["totalKm"] == 0
