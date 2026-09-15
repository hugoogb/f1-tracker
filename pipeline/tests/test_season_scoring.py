"""The scoring context on a season.

Two different kinds of claim, and they are sourced differently on purpose. The
points system is a fact about the year, from `src/scoring.py`. Whether results
were dropped is read off the results themselves, because the "best N results"
rule changed almost every season between 1950 and 1990 and the dataset does not
carry it — but the consequence, a championship total below what a driver scored,
is right there in the data.
"""

import datetime

import pytest

from src.db.models import (
    Circuit,
    Constructor,
    Driver,
    DriverStanding,
    Race,
    RaceResult,
    Season,
    SprintResult,
    Status,
)


def build_season(db, year, *, race_points, official, sprint_points=None):
    """A season where each driver's per-race points and official total are given.

    `race_points` maps driver ref -> list of per-race points; `official` maps
    driver ref -> the championship total f1db recorded.
    """
    db.add(Season(year=year))
    if db.get(Status, 1) is None:
        db.add(Status(id=1, description="Finished"))
    if db.get(Circuit, "c") is None:
        db.add(Circuit(id="c", ref="monza", name="Monza"))
    if db.get(Constructor, "c1") is None:
        db.add(Constructor(id="c1", ref="mclaren", name="McLaren"))
    rounds = max(len(p) for p in race_points.values())
    for rnd in range(1, rounds + 1):
        db.add(
            Race(
                id=f"r{year}-{rnd}",
                season_year=year,
                round=rnd,
                name=f"Round {rnd}",
                circuit_id="c",
                date=datetime.date(year, 4, 1),
            )
        )
    for ref, per_race in race_points.items():
        if db.get(Driver, ref) is None:
            db.add(Driver(id=ref, ref=ref, first_name=ref.title(), last_name=ref.title()))
        for rnd, pts in enumerate(per_race, start=1):
            db.add(
                RaceResult(
                    id=f"rr-{year}-{ref}-{rnd}",
                    race_id=f"r{year}-{rnd}",
                    driver_id=ref,
                    constructor_id="c1",
                    position=1 if pts else 11,
                    position_text="1",
                    points=pts,
                    laps=50,
                    status_id=1,
                )
            )
    for ref, per_race in (sprint_points or {}).items():
        for rnd, pts in enumerate(per_race, start=1):
            db.add(
                SprintResult(
                    id=f"sp-{year}-{ref}-{rnd}",
                    race_id=f"r{year}-{rnd}",
                    driver_id=ref,
                    constructor_id="c1",
                    position=1,
                    position_text="1",
                    points=pts,
                    status_id=1,
                )
            )
    for position, (ref, total) in enumerate(official.items(), start=1):
        db.add(
            DriverStanding(
                id=f"ds-{year}-{ref}",
                race_id=f"r{year}-{rounds}",
                driver_id=ref,
                points=total,
                position=position,
                wins=0,
            )
        )
    db.commit()


def scoring(client, year):
    response = client.get(f"/api/seasons/{year}")
    assert response.status_code == 200, response.text
    return response.json()["scoring"]


def test_the_points_system_is_reported_for_the_year(client, db):
    build_season(db, 1988, race_points={"prost": [9, 9]}, official={"prost": 18})
    body = scoring(client, 1988)

    assert body["system"]["id"] == "1961"
    assert body["system"]["label"] == "9-6-4-3-2-1"
    assert body["system"]["era"] == "1961-1990"


def test_a_modern_season_counts_every_result(client, db):
    build_season(db, 2023, race_points={"verstappen": [25, 25]}, official={"verstappen": 50})
    body = scoring(client, 2023)

    assert body["everyResultCounts"] is True
    assert body["droppedPoints"] is None


def test_a_pre_1991_season_is_marked_as_dropping_results(client, db):
    build_season(db, 1988, race_points={"prost": [9, 9]}, official={"prost": 18})
    assert scoring(client, 1988)["everyResultCounts"] is False


def test_1991_is_the_first_season_where_everything_counts(client, db):
    build_season(db, 1990, race_points={"senna": [9]}, official={"senna": 9})
    build_season(db, 1991, race_points={"senna": [10]}, official={"senna": 10})

    assert scoring(client, 1990)["everyResultCounts"] is False
    assert scoring(client, 1991)["everyResultCounts"] is True


def test_dropped_points_are_read_off_the_results(client, db):
    """1988 in miniature: more points scored than the championship kept."""
    build_season(
        db,
        1988,
        race_points={"prost": [9, 9, 9], "senna": [9, 9, 6]},
        official={"senna": 24, "prost": 18},
    )
    dropped = scoring(client, 1988)["droppedPoints"]

    assert dropped["driversAffected"] == 1
    assert dropped["largest"]["driver"]["ref"] == "prost"
    assert dropped["largest"]["scored"] == 27
    assert dropped["largest"]["counted"] == 18
    assert dropped["largest"]["dropped"] == 9


def test_the_biggest_drop_is_the_one_reported(client, db):
    build_season(
        db,
        1988,
        race_points={"prost": [9, 9, 9], "senna": [9, 9, 9], "berger": [6, 6]},
        official={"senna": 25, "prost": 18, "berger": 12},
    )
    dropped = scoring(client, 1988)["droppedPoints"]

    assert dropped["driversAffected"] == 2
    assert dropped["largest"]["driver"]["ref"] == "prost"
    assert dropped["largest"]["dropped"] == 9


def test_sprint_points_count_towards_what_a_driver_scored(client, db):
    """Otherwise a sprint would look like a dropped score."""
    build_season(
        db,
        2023,
        race_points={"verstappen": [25, 25]},
        sprint_points={"verstappen": [8]},
        official={"verstappen": 58},
    )
    assert scoring(client, 2023)["droppedPoints"] is None


@pytest.mark.parametrize("rounding", [0.0, 0.005, -0.005])
def test_rounding_is_not_a_dropped_score(client, db, rounding):
    """Half points and shared drives leave totals that do not land exactly."""
    build_season(
        db, 1958, race_points={"hawthorn": [4.5, 4.5]}, official={"hawthorn": 9 - rounding}
    )
    assert scoring(client, 1958)["droppedPoints"] is None


def test_a_driver_scoring_less_than_their_total_is_not_a_drop(client, db):
    """Only a total *below* what was scored means results were dropped."""
    build_season(db, 1958, race_points={"hawthorn": [4]}, official={"hawthorn": 9})
    assert scoring(client, 1958)["droppedPoints"] is None


def test_a_season_with_no_standings_yet_reports_the_system_only(client, db):
    db.add(Season(year=2027))
    db.commit()

    body = scoring(client, 2027)
    assert body["system"]["id"] == "2025"
    assert body["droppedPoints"] is None
