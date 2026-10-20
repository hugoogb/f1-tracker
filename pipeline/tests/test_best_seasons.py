"""Ranking every season by how good a title fight it was.

Who won and by how much come from the official final standings. How the fight
unfolded follows the running totals of race points, round by round, as the
championship progression does. The tests build seasons race by race so the
decider, the lead changes and the finale contenders can be checked against
arithmetic done by hand.
"""

import datetime

import pytest

from src.db.models import (
    Constructor,
    ConstructorStanding,
    Driver,
    DriverStanding,
    QualifyingResult,
    Race,
    RaceResult,
    Season,
    Status,
)

URL = "/api/best-seasons"

DRIVERS = {
    "a": ("alpha", "Alpha"),
    "b": ("bravo", "Bravo"),
    "c": ("charlie", "Charlie"),
}


@pytest.fixture()
def base(db):
    db.add_all(
        [
            Status(id=1, description="Finished"),
            Constructor(id="team-a", ref="team-a", name="Team A", color="#FF0000"),
            Constructor(id="team-b", ref="team-b", name="Team B", color="#0000FF"),
            *[
                Driver(id=did, ref=ref, first_name=name, last_name=name, code=did.upper() * 3)
                for did, (ref, name) in DRIVERS.items()
            ],
        ]
    )
    db.commit()


def build(db, year, rounds, *, poles=None, final=None, constructors=None, future_rounds=0):
    """A season whose race N paid `rounds[N]` ({driver: points}).

    The top scorer of each race is its winner. The official final standings sit
    on the last round run and default to the summed points; `final` overrides
    them, which is how a test reproduces a pre-1991 season where the totals
    counted differ from the points scored. `future_rounds` appends unraced rounds.
    """
    db.add(Season(year=year))
    total = len(rounds) + future_rounds
    for rnd in range(1, total + 1):
        run = rnd <= len(rounds)
        db.add(
            Race(
                id=f"{year}-{rnd}",
                season_year=year,
                round=rnd,
                name=f"{year} Round {rnd}",
                circuit_id="c",
                date=datetime.date(year, 3, rnd) if run else datetime.date(2999, 1, rnd),
            )
        )
        if not run:
            continue
        order = sorted(rounds[rnd - 1].items(), key=lambda kv: -kv[1])
        for pos, (did, pts) in enumerate(order, start=1):
            db.add(
                RaceResult(
                    id=f"rr-{year}-{rnd}-{did}",
                    race_id=f"{year}-{rnd}",
                    driver_id=did,
                    constructor_id="team-a" if did == "a" else "team-b",
                    position=pos,
                    position_text=str(pos),
                    points=pts,
                    status_id=1,
                )
            )
        if poles:
            db.add(
                QualifyingResult(
                    id=f"q-{year}-{rnd}",
                    race_id=f"{year}-{rnd}",
                    driver_id=poles[rnd - 1],
                    constructor_id="team-a",
                    position=1,
                )
            )

    last = f"{year}-{len(rounds)}"
    if final is None:
        final = {}
        for race in rounds:
            for did, pts in race.items():
                final[did] = final.get(did, 0) + pts
    for pos, (did, pts) in enumerate(sorted(final.items(), key=lambda kv: -kv[1]), start=1):
        db.add(
            DriverStanding(
                id=f"ds-{year}-{did}",
                race_id=last,
                driver_id=did,
                points=pts,
                position=pos,
                wins=0,
            )
        )
    for pos, (cid, pts) in enumerate((constructors or {}).items(), start=1):
        db.add(
            ConstructorStanding(
                id=f"cs-{year}-{cid}",
                race_id=last,
                constructor_id=cid,
                points=pts,
                position=pos,
                wins=0,
            )
        )
    db.commit()


# 2010 scoring: 25 for a win, no fastest-lap point. Running totals:
# a 25 / 40 / 58, b 18 / 43 / 55, c 15 / 30 / 45.
CLOSE = [
    {"a": 25, "b": 18, "c": 15},
    {"b": 25, "a": 15, "c": 15},
    {"a": 18, "c": 15, "b": 12},
]
# Settled with a round to spare: after round 3, Bravo's 30 + 25 cannot reach 75.
DOMINANT = [{"a": 25, "b": 10, "c": 0}] * 4


@pytest.fixture()
def two_seasons(db, base):
    build(
        db,
        2010,
        CLOSE,
        poles=["a", "b", "c"],
        constructors={"team-a": 100.0, "team-b": 90.0},
    )
    build(db, 2011, DOMINANT, poles=["a", "a", "a", "a"])


def by_year(body):
    return {s["year"]: s for s in body["seasons"]}


def test_empty_database_is_an_empty_ranking(client):
    response = client.get(URL)
    assert response.status_code == 200
    assert response.json()["seasons"] == []


def test_close_season_metrics(client, two_seasons):
    season = by_year(client.get(URL).json())[2010]

    assert season["champion"]["driver"]["ref"] == "alpha"
    assert season["runnerUp"]["driver"]["ref"] == "bravo"
    assert season["titleMargin"] == 3
    assert season["titleMarginShare"] == round(3 / 58, 4)
    assert season["decidedAtRound"] == 3
    assert season["wentToFinalRound"] is True
    # Entering the final round (25 left): Bravo leads on 43, Alpha 40 and Charlie 30 can reach it.
    assert season["contendersAtFinale"] == 3
    assert season["distinctWinners"] == 2
    assert season["distinctPoleSitters"] == 3
    # Alpha -> Bravo -> Alpha.
    assert season["leadChanges"] == 2
    assert season["distinctLeaders"] == 2


def test_dominant_season_is_settled_before_the_finale(client, two_seasons):
    season = by_year(client.get(URL).json())[2011]

    assert season["decidedAtRound"] == 3
    assert season["decidedRoundsFromEnd"] == 1
    assert season["wentToFinalRound"] is False
    assert season["contendersAtFinale"] == 1
    assert season["leadChanges"] == 0
    assert season["distinctWinners"] == 1


def test_the_closer_season_ranks_higher(client, two_seasons):
    body = client.get(URL).json()
    years = [s["year"] for s in body["seasons"]]
    assert years == [2010, 2011]
    assert body["seasons"][0]["rank"] == 1
    assert body["seasons"][1]["rank"] == 2


def test_score_is_the_documented_weighted_sum(client, two_seasons):
    body = client.get(URL).json()
    assert sum(c["weight"] for c in body["components"]) == 100
    for season in body["seasons"]:
        components = season["score"]["components"]
        assert {c["id"] for c in components} == {c["id"] for c in body["components"]}
        for c in components:
            assert 0 <= c["value"] <= 1
            assert c["points"] == pytest.approx(c["value"] * c["weight"], abs=0.01)
        assert season["score"]["total"] == pytest.approx(
            sum(c["points"] for c in components), abs=0.1
        )
        assert 0 <= season["score"]["total"] <= 100


def test_dominant_season_component_values(client, two_seasons):
    components = {
        c["id"]: c["value"] for c in by_year(client.get(URL).json())[2011]["score"]["components"]
    }
    # Margin 60 of 100 is past the 40% ceiling.
    assert components["closeness"] == 0
    # One round from the end of four: 1 - 1/2.
    assert components["lateness"] == 0.5
    assert components["contention"] == 0
    assert components["variety"] == 0
    assert components["leadChanges"] == 0


def test_champion_carries_the_team_colour(client, two_seasons):
    season = by_year(client.get(URL).json())[2010]
    assert season["champion"]["constructor"]["ref"] == "team-a"
    assert season["champion"]["constructor"]["color"] == "#FF0000"


def test_constructors_margin(client, two_seasons):
    seasons = by_year(client.get(URL).json())
    assert seasons[2010]["constructors"]["margin"] == 10
    assert seasons[2010]["constructors"]["champion"]["ref"] == "team-a"
    assert seasons[2011]["constructors"] is None


def test_champion_comes_from_official_standings_not_summed_points(client, db, base):
    """1988-style: Bravo outscored Alpha in races but dropped more of it."""
    build(
        db,
        1988,
        [{"b": 9, "a": 6}, {"a": 9, "b": 6}, {"b": 9, "a": 6}],
        final={"a": 21, "b": 18},
    )
    season = by_year(client.get(URL).json())[1988]

    assert season["champion"]["driver"]["ref"] == "alpha"
    assert season["runnerUp"]["driver"]["ref"] == "bravo"
    assert season["titleMargin"] == 3
    assert season["everyResultCounts"] is False
    assert season["progressionApproximate"] is True
    # Bravo led on points scored all season; the final round ends with the
    # official champion in front, and the title cannot be settled before it.
    assert season["decidedAtRound"] == 3
    assert season["leadChanges"] == 1


def test_modern_progression_is_exact(client, two_seasons):
    assert by_year(client.get(URL).json())[2010]["progressionApproximate"] is False


def test_a_tie_at_the_top_does_not_change_the_lead(client, db, base):
    build(db, 2012, [{"b": 25, "a": 18}, {"a": 25, "b": 18}, {"a": 25, "b": 18}])
    season = by_year(client.get(URL).json())[2012]
    # Bravo leads, holds it through the tie, then Alpha takes it.
    assert season["leadChanges"] == 1


def test_sort_by_any_metric(client, two_seasons):
    body = client.get(URL, params={"sort": "year", "order": "asc"}).json()
    assert [s["year"] for s in body["seasons"]] == [2010, 2011]
    body = client.get(URL, params={"sort": "title_margin", "order": "asc"}).json()
    assert [s["year"] for s in body["seasons"]] == [2010, 2011]
    # Ranks are by score, whatever the sort.
    assert body["seasons"][0]["rank"] == 1


def test_missing_values_sort_last(client, two_seasons):
    for order in ("asc", "desc"):
        body = client.get(URL, params={"sort": "constructors_margin", "order": order}).json()
        assert body["seasons"][-1]["year"] == 2011


def test_rejects_unknown_sort(client):
    assert client.get(URL, params={"sort": "vibes"}).status_code == 422


def test_era_is_shorthand_for_that_systems_seasons(client, two_seasons, db):
    build(db, 2003, CLOSE)
    body = client.get(URL, params={"era": "2010"}).json()
    assert body["era"]["id"] == "2010"
    assert (body["yearFrom"], body["yearTo"]) == (2010, 2018)
    assert {s["year"] for s in body["seasons"]} == {2010, 2011}
    # Ranks stay site-wide under a filter.
    assert {s["rank"] for s in body["seasons"]} <= {1, 2, 3}


def test_year_range_filter(client, two_seasons):
    body = client.get(URL, params={"year_from": 2011}).json()
    assert [s["year"] for s in body["seasons"]] == [2011]


@pytest.mark.parametrize(
    "params",
    [
        {"era": "1066"},
        {"era": "2010", "year_from": 2010},
        {"year_from": 2012, "year_to": 2010},
    ],
)
def test_rejects_bad_filters(client, params):
    assert client.get(URL, params=params).status_code == 400


def test_in_progress_season_is_excluded_unless_asked(client, two_seasons, db):
    build(db, 2026, CLOSE[:2], future_rounds=2)

    assert 2026 not in by_year(client.get(URL).json())

    season = by_year(client.get(URL, params={"include_in_progress": True}).json())[2026]
    assert season["inProgress"] is True
    assert season["rank"] is None
    assert season["decidedAtRound"] is None
    assert season["roundsRun"] == 2
    assert season["totalRounds"] == 4


def test_single_season_endpoint(client, two_seasons):
    body = client.get(f"{URL}/2011").json()
    assert body["season"]["year"] == 2011
    assert body["season"]["rank"] == 2
    assert body["rankedSeasons"] == 2
    assert client.get(f"{URL}/1949").status_code == 404


def test_does_not_shadow_season_routes(client, two_seasons):
    assert client.get("/api/seasons/2010/standings/drivers").json()["year"] == 2010


def test_no_constructors_title_before_1958(client, db, base):
    """A constructor table before 1958 is a local total, not a championship."""
    build(db, 1957, CLOSE, constructors={"team-a": 100.0, "team-b": 90.0})
    assert by_year(client.get(URL).json())[1957]["constructors"] is None
