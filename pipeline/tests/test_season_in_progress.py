"""Behaviour that only shows up mid-season, when rounds are scheduled but unraced.

The calendar for a running season lists every remaining round, so anything that
walks it has to distinguish "scheduled" from "happened".
"""

import datetime

import pytest

from src.db.models import (
    Constructor,
    ConstructorStanding,
    Driver,
    DriverStanding,
    PitStop,
    Race,
    RaceResult,
    Season,
    Status,
)


@pytest.fixture()
def in_progress_season(db):
    """A two-round season where only round 1 has been run."""
    db.add_all(
        [
            Season(year=2024),
            Status(id=1, description="Finished"),
            Constructor(id="c-red-bull", ref="red-bull", name="Red Bull", color="#4781D7"),
            Constructor(id="c-mclaren", ref="mclaren", name="McLaren", color="#F47600"),
            Driver(id="d-1", ref="max-verstappen", first_name="Max", last_name="Verstappen"),
            Driver(id="d-2", ref="lando-norris", first_name="Lando", last_name="Norris"),
        ]
    )
    db.add_all(
        [
            Race(
                id="2024_01",
                season_year=2024,
                round=1,
                name="Bahrain Grand Prix",
                circuit_id="circuit-1",
                date=datetime.date(2024, 3, 2),
                time=datetime.time(15, 0),
                fp1_at=datetime.datetime(2024, 2, 29, 11, 30),
                qualifying_at=datetime.datetime(2024, 3, 1, 16, 0),
            ),
            # Scheduled but not yet run: no results, no standings.
            Race(
                id="2024_02",
                season_year=2024,
                round=2,
                name="Saudi Arabian Grand Prix",
                circuit_id="circuit-1",
                date=datetime.date(2024, 3, 9),
            ),
        ]
    )
    db.add_all(
        [
            RaceResult(
                id="r-1",
                race_id="2024_01",
                driver_id="d-1",
                constructor_id="c-red-bull",
                grid=1,
                position=1,
                position_text="1",
                points=25.0,
                laps=57,
                status_id=1,
            ),
            RaceResult(
                id="r-2",
                race_id="2024_01",
                driver_id="d-2",
                constructor_id="c-mclaren",
                grid=2,
                position=2,
                position_text="2",
                points=18.0,
                laps=57,
                status_id=1,
            ),
            DriverStanding(
                id="ds-1", race_id="2024_01", driver_id="d-1", points=25.0, position=1, wins=1
            ),
            DriverStanding(
                id="ds-2", race_id="2024_01", driver_id="d-2", points=18.0, position=2, wins=0
            ),
            ConstructorStanding(
                id="cs-1",
                race_id="2024_01",
                constructor_id="c-red-bull",
                points=25.0,
                position=1,
                wins=1,
            ),
            ConstructorStanding(
                id="cs-2",
                race_id="2024_01",
                constructor_id="c-mclaren",
                points=18.0,
                position=2,
                wins=0,
            ),
        ]
    )
    db.commit()


def test_progression_colours_come_from_the_last_raced_round(client, seed_data, in_progress_season):
    """Every line must carry its team's colour, not fall back to grey.

    The constructor used to be read off the last *scheduled* race, which has no
    results while the season is running — leaving every driver colourless.
    """
    response = client.get("/api/seasons/2024/standings/progression")
    assert response.status_code == 200
    drivers = {d["ref"]: d for d in response.json()["drivers"]}

    assert drivers["max-verstappen"]["color"] == "#4781D7"
    assert drivers["max-verstappen"]["constructorRef"] == "red-bull"
    assert drivers["lando-norris"]["color"] == "#F47600"
    assert drivers["lando-norris"]["constructorRef"] == "mclaren"


def test_progression_stops_at_the_last_round_run(client, seed_data, in_progress_season):
    """Unraced rounds would otherwise draw every line flat to the end of the year."""
    rounds = client.get("/api/seasons/2024/standings/progression").json()["rounds"]
    assert [r["round"] for r in rounds] == [1]


def test_constructor_progression_stops_at_the_last_round_run(client, seed_data, in_progress_season):
    rounds = client.get("/api/seasons/2024/standings/constructors/progression").json()["rounds"]
    assert [r["round"] for r in rounds] == [1]


def test_season_exposes_the_weekend_schedule_in_utc(client, seed_data, in_progress_season):
    races = {r["round"]: r for r in client.get("/api/seasons/2024").json()["races"]}

    schedule = races[1]["schedule"]
    assert schedule["fp1"] == "2024-02-29T11:30:00Z"
    assert schedule["qualifying"] == "2024-03-01T16:00:00Z"
    assert schedule["race"] == "2024-03-02T15:00:00Z"
    assert schedule["sprintRace"] is None

    # A race with a date but no start time has no schedule to advertise.
    assert races[2]["schedule"]["race"] is None


def test_race_detail_exposes_the_schedule(client, seed_data, in_progress_season):
    schedule = client.get("/api/seasons/2024/races/1").json()["schedule"]
    assert schedule["qualifying"] == "2024-03-01T16:00:00Z"


@pytest.fixture()
def pit_stops(db, in_progress_season):
    """Melbourne-like pit lane times: ~13s of transit with a spread on top."""
    db.add_all(
        [
            PitStop(
                id=f"p-{i}",
                race_id="2024_01",
                driver_id=driver,
                stop_number=stop,
                lap=lap,
                duration_ms=ms,
            )
            for i, (driver, stop, lap, ms) in enumerate(
                [
                    ("d-1", 1, 12, 12_800),  # benchmark
                    ("d-1", 2, 30, 13_100),  # +0.300
                    ("d-2", 1, 14, 13_900),  # +1.100
                    ("d-2", 2, 33, 19_000),  # +6.200, a botched stop
                ]
            )
        ]
    )
    db.commit()


def test_pitstop_analysis_measures_time_lost_against_the_race_benchmark(
    client, seed_data, pit_stops
):
    data = client.get("/api/seasons/2024/races/1/pitstops/analysis").json()

    assert data["totalStops"] == 4
    assert data["benchmark"] == "12.800"
    assert data["fastestStop"]["duration"] == "12.800"
    # (12.8 + 13.1 + 13.9 + 19.0) / 4 = 14.7, i.e. 1.9s off the benchmark
    assert data["avgDuration"] == "14.700"
    assert data["medianDuration"] == "13.500"
    assert data["avgTimeLost"] == "1.900"


def test_pitstop_distribution_spreads_across_buckets(client, seed_data, pit_stops):
    """Bucketing the raw pit lane time put every stop of a race in one bar."""
    counts = {
        b["range"]: b["count"]
        for b in client.get("/api/seasons/2024/races/1/pitstops/analysis").json()["distribution"]
    }

    assert counts["+0.0-0.5s"] == 2  # the benchmark itself and +0.300
    assert counts["+0.5-1.0s"] == 0
    assert counts["+1.0-2.0s"] == 1
    assert counts["+2.0-5.0s"] == 0
    assert counts["+5.0s or more"] == 1


def test_pitstop_team_averages_rank_by_time_lost(client, seed_data, pit_stops):
    teams = client.get("/api/seasons/2024/races/1/pitstops/analysis").json()["teamAverages"]

    assert [t["constructor"]["ref"] for t in teams] == ["red-bull", "mclaren"]
    assert teams[0]["avgTimeLost"] == "0.150"
    assert teams[0]["bestDuration"] == "12.800"
    assert teams[1]["avgTimeLost"] == "3.650"


def test_pitstop_list_carries_time_lost_and_team(client, seed_data, pit_stops):
    data = client.get("/api/seasons/2024/races/1/pitstops").json()

    assert data["benchmark"] == "12.800"
    first = data["pitStops"][0]
    assert first["duration"] == "12.800"
    assert first["timeLost"] == "0.000"
    assert first["constructor"]["ref"] == "red-bull"
