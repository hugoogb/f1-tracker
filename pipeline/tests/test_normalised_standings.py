"""Re-scoring a season under another era's points system.

The point of the feature is that the answer changes: a top-heavy system rewards
wins, a flat one rewards turning up and finishing second. These fix the
arithmetic that makes that visible, and the boundaries where a system's extras
— the fastest lap point, sprints — should and should not apply.
"""

import datetime

import pytest

from src.db.models import (
    Constructor,
    Driver,
    DriverStanding,
    Race,
    RaceResult,
    Season,
    SprintResult,
    Status,
)

# Winner takes eight races, runner-up finishes second in all of them and wins
# the other two. Under a flat system the consistent driver wins; under a
# top-heavy one the race winner does.
WINNER_RACES = 6
RUNNER_UP_RACES = 4


@pytest.fixture()
def season(db):
    db.add_all(
        [
            Season(year=1988),
            Status(id=1, description="Finished"),
            Constructor(id="c1", ref="mclaren", name="McLaren", color="#F47600"),
            Driver(id="d1", ref="ace", first_name="A", last_name="Ace", code="ACE"),
            Driver(id="d2", ref="steady", first_name="S", last_name="Steady", code="STE"),
        ]
    )
    total = WINNER_RACES + RUNNER_UP_RACES
    for rnd in range(1, total + 1):
        race_id = f"r{rnd}"
        db.add(
            Race(
                id=race_id,
                season_year=1988,
                round=rnd,
                name=f"Round {rnd}",
                circuit_id="c",
                date=datetime.date(1988, 4, 1),
            )
        )
        # Ace wins the first block, Steady the rest; the other is second.
        ace_wins = rnd <= WINNER_RACES
        for driver_id, position in (
            ("d1", 1 if ace_wins else 2),
            ("d2", 2 if ace_wins else 1),
        ):
            db.add(
                RaceResult(
                    id=f"rr{rnd}{driver_id}",
                    race_id=race_id,
                    driver_id=driver_id,
                    constructor_id="c1",
                    position=position,
                    position_text=str(position),
                    points=0,
                    laps=50,
                    status_id=1,
                )
            )
    # Official standings: whatever f1db said. Deliberately different from any
    # re-scored total, so the endpoint cannot accidentally echo it.
    db.add_all(
        [
            DriverStanding(
                id="s1",
                race_id=f"r{total}",
                driver_id="d2",
                points=90,
                position=1,
                wins=RUNNER_UP_RACES,
            ),
            DriverStanding(
                id="s2",
                race_id=f"r{total}",
                driver_id="d1",
                points=87,
                position=2,
                wins=WINNER_RACES,
            ),
        ]
    )
    db.commit()


def fetch(client, system, year=1988):
    response = client.get(f"/api/seasons/{year}/standings/normalised?system={system}")
    assert response.status_code == 200, response.text
    return response.json()


def test_a_top_heavy_system_rewards_the_race_winner(client, season):
    """2010: 25 for a win, 18 for second. Ace's six wins carry it."""
    body = fetch(client, "2010")
    rows = {r["driver"]["ref"]: r for r in body["standings"]}

    assert rows["ace"]["points"] == WINNER_RACES * 25 + RUNNER_UP_RACES * 18
    assert rows["steady"]["points"] == RUNNER_UP_RACES * 25 + WINNER_RACES * 18
    assert body["standings"][0]["driver"]["ref"] == "ace"


def test_a_flatter_system_narrows_the_same_season(client, season):
    """1991: 10 for a win, 6 for second — the same results, a smaller margin."""
    top_heavy = fetch(client, "2010")["standings"]
    flat = fetch(client, "1991")["standings"]

    top_heavy_margin = top_heavy[0]["points"] - top_heavy[1]["points"]
    flat_margin = flat[0]["points"] - flat[1]["points"]
    assert flat_margin < top_heavy_margin


def test_the_response_carries_the_official_table_to_compare_against(client, season):
    body = fetch(client, "2010")
    ace = next(r for r in body["standings"] if r["driver"]["ref"] == "ace")

    assert ace["officialPosition"] == 2
    assert ace["officialPoints"] == 87
    # Second officially, first re-scored: one place gained.
    assert ace["positionDelta"] == 1
    assert body["championChanged"] is True


def test_re_scoring_under_the_season_own_system_is_flagged(client, season):
    body = fetch(client, "1961")
    assert body["isActualSystem"] is True
    assert body["actualSystem"]["id"] == "1961"


def test_fastest_lap_point_is_only_paid_by_systems_that_have_one(client, db, season):
    db.query(Race).filter(Race.id == "r1").update({"fastest_lap_driver_id": "d2"})
    db.commit()

    with_flap = fetch(client, "2019")
    without = fetch(client, "2010")

    steady_with = next(r for r in with_flap["standings"] if r["driver"]["ref"] == "steady")
    steady_without = next(r for r in without["standings"] if r["driver"]["ref"] == "steady")
    assert steady_with["points"] - steady_without["points"] == 1


def test_fastest_lap_point_respects_the_top_ten_rule(client, db, season):
    """A driver outside the top ten sets the lap but scores nothing for it."""
    # Ace's round-1 win becomes a 15th place, and he takes the fastest lap.
    db.query(RaceResult).filter(RaceResult.id == "rr1d1").update(
        {"position": 15, "position_text": "15"}
    )
    db.query(Race).filter(Race.id == "r1").update({"fastest_lap_driver_id": "d1"})
    db.commit()

    body = fetch(client, "2019")
    ace = next(r for r in body["standings"] if r["driver"]["ref"] == "ace")
    # Five wins left, one 15th, four seconds — and no bonus point.
    assert ace["points"] == (WINNER_RACES - 1) * 25 + RUNNER_UP_RACES * 18


def test_sprints_are_ignored_by_a_system_that_never_had_them(client, db, season):
    db.add(
        SprintResult(
            id="sp1",
            race_id="r1",
            driver_id="d2",
            constructor_id="c1",
            position=1,
            position_text="1",
            points=8,
            status_id=1,
        )
    )
    db.commit()

    modern = fetch(client, "2025")
    classic = fetch(client, "1961")

    steady_modern = next(r for r in modern["standings"] if r["driver"]["ref"] == "steady")
    steady_classic = next(r for r in classic["standings"] if r["driver"]["ref"] == "steady")

    assert modern["sprintsCounted"] == 1
    assert classic["sprintsCounted"] == 0
    assert steady_modern["points"] == RUNNER_UP_RACES * 25 + WINNER_RACES * 18 + 8
    assert steady_classic["points"] == RUNNER_UP_RACES * 9 + WINNER_RACES * 6


def test_an_exact_tie_is_broken_on_wins(client, db):
    """The sport's own countback, and the only one a re-score can apply.

    Under 1991 scoring a win plus a fifth (10 + 2) is level with two seconds
    (6 + 6), so the win has to decide it.
    """
    db.add_all(
        [
            Season(year=2000),
            Status(id=1, description="Finished"),
            Constructor(id="c1", ref="mclaren", name="McLaren"),
            Driver(id="d1", ref="winner", first_name="W", last_name="Winner"),
            Driver(id="d2", ref="placer", first_name="P", last_name="Placer"),
        ]
    )
    for rnd, (winner_pos, placer_pos) in enumerate(((1, 2), (5, 2)), start=1):
        db.add(
            Race(
                id=f"r{rnd}",
                season_year=2000,
                round=rnd,
                name=f"R{rnd}",
                circuit_id="c",
                date=datetime.date(2000, 4, 1),
            )
        )
        for driver_id, position in (("d1", winner_pos), ("d2", placer_pos)):
            db.add(
                RaceResult(
                    id=f"rr{rnd}{driver_id}",
                    race_id=f"r{rnd}",
                    driver_id=driver_id,
                    constructor_id="c1",
                    position=position,
                    position_text=str(position),
                    points=0,
                    laps=50,
                    status_id=1,
                )
            )
    db.commit()

    standings = fetch(client, "1991", year=2000)["standings"]

    assert standings[0]["points"] == standings[1]["points"] == 12
    assert standings[0]["driver"]["ref"] == "winner"
    assert standings[0]["wins"] == 1
    assert standings[1]["wins"] == 0


def test_unknown_points_system_is_404(client, season):
    assert client.get("/api/seasons/1988/standings/normalised?system=nope").status_code == 404


def test_unknown_season_is_404(client, season):
    assert client.get("/api/seasons/1899/standings/normalised?system=2010").status_code == 404


def test_points_systems_endpoint_lists_every_era(client):
    body = client.get("/api/points-systems").json()
    ids = [s["id"] for s in body["systems"]]

    assert ids == ["1950", "1960", "1961", "1991", "2003", "2010", "2019", "2025"]
    modern = next(s for s in body["systems"] if s["id"] == "2025")
    assert modern["racePoints"][0] == 25.0
    assert modern["fastestLapPoint"] is False
