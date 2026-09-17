import datetime

import pytest

from src.db.models import (
    Circuit,
    Constructor,
    ConstructorStanding,
    Driver,
    DriverStanding,
    QualifyingResult,
    Race,
    RaceResult,
    Season,
)


def test_records_empty(client):
    response = client.get("/api/records")
    assert response.status_code == 200
    data = response.json()
    assert data["drivers"]["mostWins"] == []
    assert data["constructors"]["mostWins"] == []


def test_records_with_data(client, race_seed_data):
    response = client.get("/api/records")
    assert response.status_code == 200
    data = response.json()

    # driver-1 has 1 win, 1 podium, 1 start
    assert len(data["drivers"]["mostWins"]) >= 1
    assert data["drivers"]["mostWins"][0]["driver"]["ref"] == "max_verstappen"
    assert data["drivers"]["mostWins"][0]["count"] == 1

    assert len(data["drivers"]["mostPodiums"]) >= 1
    assert len(data["drivers"]["mostStarts"]) >= 1

    # constructor-1 has 1 win
    assert len(data["constructors"]["mostWins"]) >= 1
    assert data["constructors"]["mostWins"][0]["constructor"]["ref"] == "red_bull"


def test_records_limit_param(client, race_seed_data):
    response = client.get("/api/records?limit=1")
    assert response.status_code == 200
    data = response.json()
    assert len(data["drivers"]["mostWins"]) <= 1
    assert len(data["drivers"]["mostStarts"]) <= 1


# --- /api/records/explore -----------------------------------------------------

EXPLORE = "/api/records/explore"


@pytest.fixture()
def explore_seed(db):
    """Two seasons either side of the 1991 scoring change.

    1988 is built so the raw points and the championship disagree: Alpha scores
    24 points across the three races and Bravo 21, but the official final-round
    standings make Bravo champion on 21 to Alpha's 18 — the "best N results"
    rule the pre-1991 seasons ran under. Any category that re-derived the title
    from race points would crown Alpha, so this is the fixture that catches it.

    2020 adds Charlie, a one-start winner, whose whole purpose is to be excluded
    from the rate categories by the denominator floor.
    """
    circuit_id = "circuit-x"
    db.add_all([Season(year=1988), Season(year=2020)])
    db.add(Circuit(id=circuit_id, ref="test-circuit", name="Test Circuit", country="Italy"))
    db.add_all(
        [
            Driver(
                id="d-a",
                ref="alpha",
                first_name="Ayrton",
                last_name="Alpha",
                nationality="British",
                country_code="GB",
            ),
            Driver(
                id="d-b",
                ref="bravo",
                first_name="Bruno",
                last_name="Bravo",
                nationality="Italian",
                country_code="IT",
            ),
            Driver(
                id="d-c",
                ref="charlie",
                first_name="Colin",
                last_name="Charlie",
                nationality="British",
                country_code="GB",
            ),
        ]
    )
    db.add_all(
        [
            Constructor(
                id="c-a",
                ref="team-alpha",
                name="Team Alpha",
                nationality="British",
                color="#111111",
            ),
            Constructor(
                id="c-b",
                ref="team-bravo",
                name="Team Bravo",
                nationality="Italian",
                color="#222222",
            ),
        ]
    )

    # (race id, year, round, fastest lap driver, fastest lap constructor)
    races = [
        ("r1", 1988, 1, "d-a", "c-a"),
        ("r2", 1988, 2, "d-a", "c-a"),
        ("r3", 1988, 3, "d-b", "c-b"),
        ("r4", 2020, 1, "d-a", "c-a"),
        ("r5", 2020, 2, "d-c", "c-b"),
    ]
    for race_id, year, rnd, fl_driver, fl_constructor in races:
        db.add(
            Race(
                id=race_id,
                season_year=year,
                round=rnd,
                name=f"{year} Round {rnd}",
                circuit_id=circuit_id,
                date=datetime.date(year, 3, rnd),
                fastest_lap_driver_id=fl_driver,
                fastest_lap_constructor_id=fl_constructor,
            )
        )

    # (race, driver, constructor, position, points)
    results = [
        ("r1", "d-a", "c-a", 1, 9.0),
        ("r1", "d-b", "c-b", 2, 6.0),
        ("r2", "d-a", "c-a", 1, 9.0),
        ("r2", "d-b", "c-b", 2, 6.0),
        ("r3", "d-a", "c-a", 2, 6.0),
        ("r3", "d-b", "c-b", 1, 9.0),
        ("r4", "d-a", "c-a", 1, 25.0),
        ("r4", "d-b", "c-b", 2, 18.0),
        ("r5", "d-c", "c-b", 1, 25.0),
        ("r5", "d-a", "c-a", 2, 18.0),
        ("r5", "d-b", "c-b", 3, 15.0),
    ]
    for index, (race_id, driver_id, constructor_id, position, points) in enumerate(results):
        db.add(
            RaceResult(
                id=f"rr-{index}",
                race_id=race_id,
                driver_id=driver_id,
                constructor_id=constructor_id,
                position=position,
                position_text=str(position),
                points=points,
                laps=50,
            )
        )

    poles = [
        ("r1", "d-a", "c-a", 1),
        ("r1", "d-b", "c-b", 2),
        ("r2", "d-a", "c-a", 1),
        ("r2", "d-b", "c-b", 2),
        ("r3", "d-b", "c-b", 1),
        ("r3", "d-a", "c-a", 2),
        ("r4", "d-a", "c-a", 1),
        ("r4", "d-b", "c-b", 2),
        ("r5", "d-b", "c-b", 1),
        ("r5", "d-a", "c-a", 2),
    ]
    for index, (race_id, driver_id, constructor_id, position) in enumerate(poles):
        db.add(
            QualifyingResult(
                id=f"q-{index}",
                race_id=race_id,
                driver_id=driver_id,
                constructor_id=constructor_id,
                position=position,
            )
        )

    # Official standings after each season's final round. 1988 deliberately
    # contradicts the sum of the races.
    db.add_all(
        [
            DriverStanding(
                id="ds-a88", race_id="r3", driver_id="d-b", points=21.0, position=1, wins=1
            ),
            DriverStanding(
                id="ds-b88", race_id="r3", driver_id="d-a", points=18.0, position=2, wins=2
            ),
            DriverStanding(
                id="ds-a20", race_id="r5", driver_id="d-a", points=43.0, position=1, wins=1
            ),
            DriverStanding(
                id="ds-b20", race_id="r5", driver_id="d-b", points=33.0, position=2, wins=0
            ),
            DriverStanding(
                id="ds-c20", race_id="r5", driver_id="d-c", points=25.0, position=3, wins=1
            ),
            ConstructorStanding(
                id="cs-88", race_id="r3", constructor_id="c-b", points=21.0, position=1, wins=1
            ),
            ConstructorStanding(
                id="cs-88b", race_id="r3", constructor_id="c-a", points=18.0, position=2, wins=2
            ),
            ConstructorStanding(
                id="cs-20", race_id="r5", constructor_id="c-a", points=43.0, position=1, wins=1
            ),
            ConstructorStanding(
                id="cs-20b", race_id="r5", constructor_id="c-b", points=33.0, position=2, wins=1
            ),
        ]
    )
    db.commit()


def _refs(payload, key="driver"):
    return [row[key]["ref"] for row in payload["data"]]


def _values(payload):
    return [row["value"] for row in payload["data"]]


def test_explore_requires_entity(client):
    assert client.get(EXPLORE).status_code == 422


def test_explore_rejects_unknown_category(client):
    assert client.get(f"{EXPLORE}?entity=driver&category=vibes").status_code == 422


@pytest.mark.parametrize(
    "category,expected_refs,expected_values",
    [
        ("wins", ["alpha", "bravo", "charlie"], [3, 1, 1]),
        ("podiums", ["alpha", "bravo", "charlie"], [5, 5, 1]),
        ("poles", ["alpha", "bravo"], [3, 2]),
        ("fastest_laps", ["alpha", "bravo", "charlie"], [3, 1, 1]),
        ("starts", ["alpha", "bravo", "charlie"], [5, 5, 1]),
        ("championships", ["alpha", "bravo"], [1, 1]),
        ("points", ["alpha", "bravo", "charlie"], [67.0, 54.0, 25.0]),
    ],
)
def test_explore_driver_categories_are_ordered(
    client, explore_seed, category, expected_refs, expected_values
):
    response = client.get(f"{EXPLORE}?entity=driver&category={category}")
    assert response.status_code == 200
    payload = response.json()
    assert _refs(payload) == expected_refs
    assert _values(payload) == expected_values
    assert payload["total"] == len(expected_refs)
    assert _values(payload) == sorted(_values(payload), reverse=True)


def test_explore_sort_ascending_reverses_the_table(client, explore_seed):
    descending = client.get(f"{EXPLORE}?entity=driver&category=wins").json()
    ascending = client.get(f"{EXPLORE}?entity=driver&category=wins&sort=asc").json()
    assert _values(ascending) == sorted(_values(descending))
    assert ascending["data"][0]["rank"] == 1


def test_explore_constructor_categories(client, explore_seed):
    wins = client.get(f"{EXPLORE}?entity=constructor&category=wins").json()
    assert _refs(wins, "constructor") == ["team-alpha", "team-bravo"]
    assert _values(wins) == [3, 2]
    # The payload carries the backend palette colour like every other endpoint.
    assert wins["data"][0]["constructor"]["color"] == "#111111"

    entries = client.get(f"{EXPLORE}?entity=constructor&category=starts").json()
    assert entries["label"] == "Entries"
    assert _values(entries) == [6, 5]

    titles = client.get(f"{EXPLORE}?entity=constructor&category=championships").json()
    assert sorted(_refs(titles, "constructor")) == ["team-alpha", "team-bravo"]


def test_explore_min_starts_excludes_one_start_wonders(client, explore_seed):
    """Charlie won his only race. He is not the best win rate in history."""
    generous = client.get(f"{EXPLORE}?entity=driver&category=win_rate&min_starts=1").json()
    assert generous["data"][0]["driver"]["ref"] == "charlie"
    assert generous["data"][0]["value"] == 1.0

    guarded = client.get(f"{EXPLORE}?entity=driver&category=win_rate&min_starts=5").json()
    assert "charlie" not in _refs(guarded)
    assert guarded["data"][0]["driver"]["ref"] == "alpha"
    assert guarded["data"][0]["value"] == 0.6


def test_explore_rate_categories_default_to_a_nonzero_floor(client, explore_seed):
    payload = client.get(f"{EXPLORE}?entity=driver&category=win_rate").json()
    assert payload["minStarts"] > 0
    # Nobody in the fixture clears the default floor, which is the point.
    assert payload["data"] == []


def test_explore_rate_floor_can_never_be_zero(client, explore_seed):
    """min_starts=0 on a rate would invite a division by zero; it is clamped."""
    payload = client.get(f"{EXPLORE}?entity=driver&category=podium_rate&min_starts=0").json()
    assert payload["minStarts"] == 1
    assert all(row["starts"] >= 1 for row in payload["data"])
    assert all(0.0 <= row["value"] <= 1.0 for row in payload["data"])


def test_explore_year_range_narrows_results(client, explore_seed):
    all_time = client.get(f"{EXPLORE}?entity=driver&category=wins").json()
    only_1988 = client.get(
        f"{EXPLORE}?entity=driver&category=wins&year_from=1988&year_to=1988"
    ).json()
    assert only_1988["total"] < all_time["total"]
    assert _refs(only_1988) == ["alpha", "bravo"]
    assert _values(only_1988) == [2, 1]
    # Starts are scoped to the range too, not carried over from the career.
    assert [row["starts"] for row in only_1988["data"]] == [3, 3]


def test_explore_year_range_on_championships_filters_by_season(client, explore_seed):
    """1988's title belongs to 1988 even though the race happened in March."""
    payload = client.get(
        f"{EXPLORE}?entity=driver&category=championships&year_from=1988&year_to=1988"
    ).json()
    assert _refs(payload) == ["bravo"]
    assert _values(payload) == [1]


def test_explore_championships_follow_official_standings_not_summed_points(client, explore_seed):
    """Alpha out-scored Bravo in 1988 and still lost the championship.

    That is the pre-1991 dropped-scores rule, and it is why titles are read off
    the official final-round standings rather than re-derived from race points.
    """
    points = client.get(
        f"{EXPLORE}?entity=driver&category=points&year_from=1988&year_to=1988"
    ).json()
    assert _refs(points) == ["alpha", "bravo"]
    assert _values(points) == [24.0, 21.0]

    titles = client.get(
        f"{EXPLORE}?entity=driver&category=championships&year_from=1988&year_to=1988"
    ).json()
    assert _refs(titles) == ["bravo"]
    assert "alpha" not in _refs(titles)


def test_explore_era_is_shorthand_for_that_systems_seasons(client, explore_seed):
    payload = client.get(f"{EXPLORE}?entity=driver&category=wins&era=1961").json()
    assert payload["yearFrom"] == 1961
    assert payload["yearTo"] == 1990
    assert payload["era"]["id"] == "1961"
    assert _refs(payload) == ["alpha", "bravo"]

    modern = client.get(f"{EXPLORE}?entity=driver&category=wins&era=2019").json()
    assert modern["yearFrom"] == 2019
    assert modern["yearTo"] == 2024
    assert sorted(_refs(modern)) == ["alpha", "charlie"]


def test_explore_open_ended_era_has_no_upper_bound(client, explore_seed):
    payload = client.get(f"{EXPLORE}?entity=driver&category=wins&era=2025").json()
    assert payload["yearFrom"] == 2025
    assert payload["yearTo"] is None


def test_explore_rejects_unknown_era(client):
    response = client.get(f"{EXPLORE}?entity=driver&category=wins&era=1867")
    assert response.status_code == 400


def test_explore_rejects_era_and_year_range_together(client):
    response = client.get(f"{EXPLORE}?entity=driver&category=wins&era=1961&year_from=1970")
    assert response.status_code == 400


def test_explore_rejects_inverted_year_range(client):
    response = client.get(f"{EXPLORE}?entity=driver&category=wins&year_from=2020&year_to=1990")
    assert response.status_code == 400


def test_explore_filters_drivers_by_nationality(client, explore_seed):
    payload = client.get(f"{EXPLORE}?entity=driver&category=wins&nationality=british").json()
    assert sorted(_refs(payload)) == ["alpha", "charlie"]


def test_explore_filters_constructors_by_country(client, explore_seed):
    payload = client.get(f"{EXPLORE}?entity=constructor&category=wins&country=Italian").json()
    assert _refs(payload, "constructor") == ["team-bravo"]


def test_explore_limit_is_bounded(client, explore_seed):
    assert client.get(f"{EXPLORE}?entity=driver&category=wins&limit=0").status_code == 422
    assert client.get(f"{EXPLORE}?entity=driver&category=wins&limit=500").status_code == 422
    assert client.get(f"{EXPLORE}?entity=driver&category=wins&limit=50").status_code == 200


def test_explore_paginates_with_offset_aware_ranks(client, explore_seed):
    first = client.get(f"{EXPLORE}?entity=driver&category=wins&limit=2").json()
    second = client.get(f"{EXPLORE}?entity=driver&category=wins&limit=2&page=2").json()
    assert first["total"] == second["total"] == 3
    assert [row["rank"] for row in first["data"]] == [1, 2]
    assert [row["rank"] for row in second["data"]] == [3]
    assert first["pageSize"] == 2
    assert set(_refs(first)).isdisjoint(_refs(second))


def test_explore_empty_result_set_is_an_empty_list(client, explore_seed):
    payload = client.get(f"{EXPLORE}?entity=driver&category=wins&year_from=2030").json()
    assert payload["data"] == []
    assert payload["total"] == 0


def test_explore_on_an_empty_database(client):
    for category in (
        "wins",
        "poles",
        "podiums",
        "fastest_laps",
        "starts",
        "championships",
        "points",
        "win_rate",
        "podium_rate",
    ):
        for entity in ("driver", "constructor"):
            response = client.get(f"{EXPLORE}?entity={entity}&category={category}")
            assert response.status_code == 200, (entity, category)
            assert response.json()["data"] == []


def test_explore_describes_what_it_is_showing(client, explore_seed):
    titles = client.get(f"{EXPLORE}?entity=driver&category=championships").json()
    assert "official standings" in titles["note"]
    assert titles["label"] == "Championships"
    assert titles["format"] == "integer"

    rates = client.get(f"{EXPLORE}?entity=driver&category=win_rate&min_starts=1").json()
    assert rates["format"] == "percent"
    assert "share of race starts" in rates["note"]
