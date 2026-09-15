"""Who can still win the title.

The arithmetic is simple; the edges are where it goes wrong. A season in
progress lists rounds that have not happened, sprints are only on some
weekends, and "mathematically alive" has to mean the strict thing even when it
stops being realistic.
"""

import datetime

from src.db.models import (
    Constructor,
    Driver,
    DriverStanding,
    Race,
    RaceResult,
    Season,
    Status,
)

TOTAL_ROUNDS = 10
ROUNDS_RUN = 8


def build_season(db, *, year=2026, rounds_run=ROUNDS_RUN, sprint_rounds=(), points=None):
    """A season with `rounds_run` rounds completed out of TOTAL_ROUNDS."""
    db.add_all(
        [
            Season(year=year),
            Status(id=1, description="Finished"),
            Constructor(id="c1", ref="mclaren", name="McLaren", color="#F47600"),
            Driver(id="d1", ref="leader", first_name="L", last_name="Leader", code="LEA"),
            Driver(id="d2", ref="chaser", first_name="C", last_name="Chaser", code="CHA"),
            Driver(id="d3", ref="tailender", first_name="T", last_name="Tail", code="TAI"),
        ]
    )
    for rnd in range(1, TOTAL_ROUNDS + 1):
        db.add(
            Race(
                id=f"r{rnd}",
                season_year=year,
                round=rnd,
                name=f"Round {rnd}",
                circuit_id="c",
                date=datetime.date(year, 3, 1),
                sprint_race_at=(
                    datetime.datetime(year, 3, 1, 14, 0) if rnd in sprint_rounds else None
                ),
            )
        )
    # A round counts as run once it has results.
    for rnd in range(1, rounds_run + 1):
        for i, driver_id in enumerate(("d1", "d2", "d3"), start=1):
            db.add(
                RaceResult(
                    id=f"rr{rnd}{driver_id}",
                    race_id=f"r{rnd}",
                    driver_id=driver_id,
                    constructor_id="c1",
                    position=i,
                    position_text=str(i),
                    points=0,
                    laps=50,
                    status_id=1,
                )
            )

    points = points or {"d1": 300.0, "d2": 250.0, "d3": 10.0}
    for i, (driver_id, pts) in enumerate(points.items(), start=1):
        db.add(
            DriverStanding(
                id=f"s{driver_id}",
                race_id=f"r{rounds_run}",
                driver_id=driver_id,
                points=pts,
                position=i,
                wins=0,
            )
        )
    db.commit()


def fetch(client, year=2026):
    response = client.get(f"/api/seasons/{year}/permutations")
    assert response.status_code == 200, response.text
    return response.json()


def test_counts_the_rounds_still_to_come(client, db):
    build_season(db)
    body = fetch(client)

    assert body["roundsRun"] == ROUNDS_RUN
    assert body["totalRounds"] == TOTAL_ROUNDS
    assert body["racesRemaining"] == TOTAL_ROUNDS - ROUNDS_RUN


def test_max_remaining_uses_the_season_own_points_system(client, db):
    """2026 pays 25 for a win and nothing for the fastest lap."""
    build_season(db)
    body = fetch(client)

    assert body["pointsSystem"]["id"] == "2025"
    assert body["maxRemaining"] == 2 * 25


def test_the_fastest_lap_point_counts_where_the_era_had_one(client, db):
    build_season(db, year=2023)
    body = fetch(client, year=2023)

    assert body["pointsSystem"]["id"] == "2019"
    assert body["maxRemaining"] == 2 * 26


def test_sprints_on_remaining_rounds_add_to_the_total(client, db):
    """Only the rounds still to come, and only the ones with a sprint."""
    build_season(db, sprint_rounds=(3, 9))
    body = fetch(client)

    assert body["sprintsRemaining"] == 1
    assert body["maxRemaining"] == 2 * 25 + 8


def test_a_driver_is_out_only_when_the_maths_says_so(client, db):
    """Fifty points left: the chaser is alive at -50, the tailender is not."""
    build_season(db, points={"d1": 300.0, "d2": 250.0, "d3": 10.0})
    contenders = {c["driver"]["ref"]: c for c in fetch(client)["contenders"]}

    assert contenders["chaser"]["alive"] is True
    assert contenders["chaser"]["maxPossible"] == 300.0
    assert contenders["tailender"]["alive"] is False
    assert contenders["tailender"]["deficit"] == 290.0


def test_drawing_level_is_flagged_as_a_countback(client, db):
    """Reaching the leader's exact total does not win it on points."""
    build_season(db, points={"d1": 300.0, "d2": 250.0, "d3": 10.0})
    chaser = next(c for c in fetch(client)["contenders"] if c["driver"]["ref"] == "chaser")

    assert chaser["maxPossible"] == 300.0
    assert chaser["onlyOnCountback"] is True


def test_a_chaser_who_can_overtake_outright_is_not_a_countback_case(client, db):
    build_season(db, points={"d1": 300.0, "d2": 260.0, "d3": 10.0})
    chaser = next(c for c in fetch(client)["contenders"] if c["driver"]["ref"] == "chaser")

    assert chaser["alive"] is True
    assert chaser["onlyOnCountback"] is False


def test_the_title_is_settled_once_nobody_can_reach_the_leader(client, db):
    build_season(db, points={"d1": 300.0, "d2": 200.0, "d3": 10.0})
    body = fetch(client)

    assert body["decided"] is True
    assert body["aliveCount"] == 1
    assert body["seasonComplete"] is False


def test_a_finished_season_is_decided(client, db):
    build_season(db, rounds_run=TOTAL_ROUNDS)
    body = fetch(client)

    assert body["seasonComplete"] is True
    assert body["decided"] is True
    assert body["racesRemaining"] == 0
    assert body["maxRemaining"] == 0


def test_the_leader_clinch_margin_is_one_more_than_is_available(client, db):
    build_season(db)
    body = fetch(client)

    assert body["marginToClinch"] == body["maxRemaining"] + 1


def test_clinching_at_the_next_round(client, db):
    """The leader wins the next round, the chaser scores nothing there.

    With four rounds left that leaves 75 available afterwards, so the lead has
    to be worth more than 75 - 25 = 50 points for the next round to settle it.
    """
    build_season(db, rounds_run=6, points={"d1": 300.0, "d2": 240.0, "d3": 10.0})
    assert fetch(client)["canClinchNextRound"] is True

    db.query(DriverStanding).filter(DriverStanding.driver_id == "d2").update({"points": 260.0})
    db.commit()
    assert fetch(client)["canClinchNextRound"] is False


def test_the_last_round_can_always_be_clinched_by_winning_it(client, db):
    """Nothing is left afterwards, so a win with the chaser scoring nothing ends it."""
    build_season(db, rounds_run=TOTAL_ROUNDS - 1, points={"d1": 300.0, "d2": 299.0, "d3": 10.0})
    assert fetch(client)["canClinchNextRound"] is True


def test_the_next_round_is_named(client, db):
    build_season(db)
    assert fetch(client)["nextRound"] == {
        "round": ROUNDS_RUN + 1,
        "name": f"Round {ROUNDS_RUN + 1}",
    }


def test_a_season_that_has_not_started(client, db):
    build_season(db, rounds_run=0)
    body = fetch(client)

    assert body["started"] is False
    assert body["contenders"] == []


def test_unknown_season_is_404(client, db):
    assert client.get("/api/seasons/1899/permutations").status_code == 404
