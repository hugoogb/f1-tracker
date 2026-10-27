import json

import pytest

import src.chat.tools  # noqa: F401
from src.chat.constants import MAX_TOOL_RESULT_CHARS
from src.chat.tools.registry import run_tool, tool_label, tool_specs

EXPECTED_TOOLS = {
    "search",
    "site_map",
    "get_season",
    "get_standings",
    "get_progression",
    "get_title_permutations",
    "get_calendar",
    "get_race",
    "get_driver",
    "get_constructor",
    "get_circuit",
    "get_records",
    "get_champions",
    "get_best_seasons",
    "compare_drivers",
    "compare_constructors",
    "compare_in_season",
    "navigate",
}


def call(db, name, args):
    return json.loads(run_tool(db, name, args))


def test_the_full_tool_set_is_registered():
    assert {s["name"] for s in tool_specs()} == EXPECTED_TOOLS


def test_labels():
    assert tool_label("get_race", {"year": 2023, "round": 1, "section": "results"}) == (
        "2023 round 1 results"
    )
    assert tool_label("get_driver", {"ref": "perez"}) == "driver perez"
    assert tool_label("compare_drivers", {"a": "x", "b": "y"}) == "compare x vs y"
    assert (
        tool_label("compare_in_season", {"year": 2023, "kind": "drivers", "a": "x", "b": "y"})
        == "2023 compare"
    )


@pytest.mark.parametrize("section", ["results", "qualifying", "sprint", "pitstops"])
def test_get_race_sections_share_the_race_href_and_stay_compact(db, race_seed_data, section):
    out = call(db, "get_race", {"year": 2023, "round": 1, "section": section})
    assert out.get("href") == "/seasons/2023/races/1" or "error" in out
    assert len(json.dumps(out)) < MAX_TOOL_RESULT_CHARS


def test_get_race_results_are_the_top_ten_with_grid_points_and_status(db, race_seed_data):
    out = call(db, "get_race", {"year": 2023, "round": 1, "section": "results"})
    assert len(out["rows"]) <= 10
    assert {"position", "name", "ref", "constructor", "grid", "points", "status"} <= set(
        out["rows"][0]
    )
    assert out["circuit"]["href"] == "/circuits/monza"
    assert out["fastestLap"]["ref"] == "max_verstappen"


def test_get_race_pitstops_carry_time_lost_against_the_benchmark(db, race_seed_data):
    out = call(db, "get_race", {"year": 2023, "round": 1, "section": "pitstops"})
    assert "timeLost" in out["rows"][0] and out["coverage"]["benchmark"]


def test_get_race_missing_race_or_section_is_an_error(db, race_seed_data):
    assert "error" in call(db, "get_race", {"year": 1999, "round": 1, "section": "results"})
    assert "error" in call(db, "get_race", {"year": 2023, "round": 1, "section": "sprint"})


def test_entity_tools_carry_career_totals_and_hrefs(db, seed_data):
    d = call(db, "get_driver", {"ref": "max_verstappen"})
    assert d["href"] == "/drivers/max_verstappen"
    assert {"starts", "wins", "podiums", "poles", "championships", "points"} <= set(d["career"])
    c = call(db, "get_constructor", {"ref": "red_bull"})
    assert c["href"] == "/constructors/red_bull" and "lineage" in c and "chain" in c["note"]
    assert "error" in call(db, "get_driver", {"ref": "nobody"})
    assert "error" in call(db, "get_constructor", {"ref": "nobody"})
    assert "error" in call(db, "get_circuit", {"ref": "nowhere"})


def test_get_circuit_counts_races_and_names_winners(db, race_seed_data):
    out = call(db, "get_circuit", {"ref": "monza"})
    assert out["href"] == "/circuits/monza" and out["races"] == 1
    assert out["firstYear"] == out["lastYear"] == 2023
    assert out["mostWins"][0]["ref"] == "max_verstappen"


def test_get_records_passes_every_filter_explicitly(db, race_seed_data):
    out = call(
        db,
        "get_records",
        {
            "entity": "driver",
            "category": "wins",
            "year_from": None,
            "year_to": None,
            "nationality": None,
            "min_starts": None,
            "limit": 3,
        },
    )
    assert out["href"] == "/records" and len(out["rows"]) <= 3
    assert out["rows"][0]["href"].startswith("/drivers/")


def test_get_records_clamps_limit_and_reports_bad_ranges(db, race_seed_data):
    base = {
        "entity": "constructor",
        "category": "points",
        "year_from": None,
        "year_to": None,
        "nationality": None,
        "min_starts": None,
    }
    out = call(db, "get_records", {**base, "limit": 500})
    assert out["rows"][0]["href"].startswith("/constructors/")
    bad = call(db, "get_records", {**base, "limit": 5, "year_from": 2020, "year_to": 2010})
    assert "error" in bad


def test_champions_keep_driver_and_constructor_champions_apart(db, seed_data):
    out = call(db, "get_champions", {"year_from": None, "year_to": None})
    assert out["href"] == "/champions"
    for s in out["seasons"]:
        assert set(s) >= {"year", "driver", "constructor", "href"}


def test_champions_have_no_constructors_champion_before_1958(db, race_seed_data, season_1955):
    out = call(db, "get_champions", {"year_from": None, "year_to": None})
    by_year = {s["year"]: s for s in out["seasons"]}
    assert by_year[1955]["driver"]["ref"] == "max_verstappen"
    assert by_year[1955]["constructor"] is None
    assert by_year[2023]["constructor"] == {"name": "Red Bull", "ref": "red_bull"}


def test_best_seasons_is_ranked_and_bounded(db, race_seed_data):
    out = call(db, "get_best_seasons", {"limit": 99})
    assert out["href"] == "/best-seasons" and len(out["seasons"]) <= 10


def test_compare_drivers_builds_the_page_href(db, race_seed_data):
    out = call(db, "compare_drivers", {"a": "max_verstappen", "b": "perez"})
    assert out["href"].startswith("/compare/drivers?")
    assert out["a"]["href"] == "/drivers/max_verstappen"
    assert out["careers"]["a"]["wins"] == 1 and out["headToHead"]["race"]["a"] == 1
    assert len(json.dumps(out)) < MAX_TOOL_RESULT_CHARS


def test_compare_same_ref_twice_or_unknown_is_an_error(db, race_seed_data):
    same = {"a": "max_verstappen", "b": "max_verstappen"}
    assert "error" in call(db, "compare_drivers", same)
    assert "error" in call(db, "compare_constructors", {"a": "red_bull", "b": "red_bull"})
    assert "error" in call(db, "compare_drivers", {"a": "max_verstappen", "b": "nobody"})


def test_compare_constructors_and_in_season(db, race_seed_data):
    c = call(db, "compare_constructors", {"a": "red_bull", "b": "ferrari"})
    assert c["href"].startswith("/compare/constructors?") and "careers" in c
    s = call(
        db,
        "compare_in_season",
        {"year": 2023, "kind": "drivers", "a": "max_verstappen", "b": "perez"},
    )
    assert s["href"] == "/seasons/2023/compare?type=drivers&a=max_verstappen&b=perez"
    assert {"points", "wins", "podiums", "poles", "headToHead"} <= set(s["season"])
    assert "official" in s["note"]
    missing = call(db, "compare_in_season", {"year": 1999, "kind": "drivers", "a": "x", "b": "y"})
    assert "error" in missing


def test_best_seasons_rows_carry_rank_year_score_and_href(db, race_seed_data):
    out = call(db, "get_best_seasons", {"limit": 5})
    assert out["seasons"], "the seeded 2023 season is complete and must rank"
    top = out["seasons"][0]
    assert top["rank"] == 1 and top["year"] == 2023
    assert isinstance(top["score"], int | float)
    assert top["href"] == "/seasons/2023"


def test_get_race_qualifying_rows_are_in_grid_order(db, race_seed_data):
    out = call(db, "get_race", {"year": 2023, "round": 1, "section": "qualifying"})
    assert [r["ref"] for r in out["rows"]] == ["max_verstappen", "perez"]
    assert out["rows"][0]["position"] == 1


def test_get_race_sprint_rows_when_a_sprint_was_run(db, race_seed_data):
    from src.db.models import SprintResult

    db.add(
        SprintResult(
            id="sprint-1",
            race_id="race-1",
            driver_id="driver-2",
            constructor_id="constructor-1",
            grid=1,
            position=1,
            position_text="1",
            points=8.0,
            laps=19,
            status_id=1,
        )
    )
    db.commit()
    out = call(db, "get_race", {"year": 2023, "round": 1, "section": "sprint"})
    assert out["href"] == "/seasons/2023/races/1"
    assert out["rows"][0]["ref"] == "perez" and out["rows"][0]["points"] == 8.0


def test_compare_in_season_constructors(db, race_seed_data):
    from src.db.models import ConstructorStanding, Driver, RaceResult

    db.add_all(
        [
            Driver(id="driver-3", ref="leclerc", first_name="Charles", last_name="Leclerc"),
            RaceResult(
                id="result-3",
                race_id="race-1",
                driver_id="driver-3",
                constructor_id="constructor-2",
                grid=3,
                position=3,
                position_text="3",
                points=15.0,
                laps=57,
                status_id=1,
            ),
            ConstructorStanding(
                id="cs-2",
                race_id="race-1",
                constructor_id="constructor-2",
                points=15.0,
                position=2,
                wins=0,
            ),
        ]
    )
    db.commit()
    s = call(
        db,
        "compare_in_season",
        {"year": 2023, "kind": "constructors", "a": "red_bull", "b": "ferrari"},
    )
    assert s["href"] == "/seasons/2023/compare?type=constructors&a=red_bull&b=ferrari"
    assert s["a"] == {"name": "Red Bull", "ref": "red_bull", "href": "/constructors/red_bull"}
    assert s["season"]["wins"]["a"] == 1


def test_get_constructor_lists_its_lineage_in_order(db, seed_data):
    from src.db.models import Constructor, ConstructorLineage

    db.add_all(
        [
            Constructor(id="constructor-s", ref="stewart", name="Stewart"),
            ConstructorLineage(
                lineage_ref="stewart",
                constructor_id="constructor-s",
                position=0,
                year_from=1997,
                year_to=1999,
            ),
            ConstructorLineage(
                lineage_ref="stewart",
                constructor_id="constructor-1",
                position=1,
                year_from=2005,
                year_to=None,
            ),
        ]
    )
    db.commit()
    lineage = call(db, "get_constructor", {"ref": "red_bull"})["lineage"]
    assert [e["ref"] for e in lineage] == ["stewart", "red_bull"]
    assert lineage[0]["href"] == "/constructors/stewart" and lineage[0]["years"]


def _seed_champion_seasons(db, first: int, count: int) -> None:
    import datetime

    from src.db.models import DriverStanding, Race, Season

    for year in range(first, first + count):
        race_id = f"race-{year}"
        db.add_all(
            [
                Season(year=year),
                Race(
                    id=race_id,
                    season_year=year,
                    round=1,
                    name="Italian Grand Prix",
                    circuit_id="circuit-1",
                    date=datetime.date(year, 9, 1),
                ),
                DriverStanding(
                    id=f"ds-{year}",
                    race_id=race_id,
                    driver_id="driver-1",
                    points=9.0,
                    position=1,
                ),
            ]
        )
    db.commit()


def test_champions_are_trimmed_to_25_with_a_note(db, seed_data):
    _seed_champion_seasons(db, 1960, 27)
    out = call(db, "get_champions", {"year_from": None, "year_to": None})
    assert out["total"] == 27 and len(out["seasons"]) == 25
    assert out["seasons"][0]["year"] == 1986  # newest first
    assert out["note"].startswith("newest 25 of 27 seasons")
    assert len(json.dumps(out)) < MAX_TOOL_RESULT_CHARS


def test_champions_page_from_the_oldest_with_a_clamped_limit(db, seed_data):
    _seed_champion_seasons(db, 1960, 27)
    base = {"year_from": None, "year_to": None, "oldest_first": True}
    out = call(db, "get_champions", {**base, "limit": 3})
    assert [s["year"] for s in out["seasons"]] == [1960, 1961, 1962]
    assert out["note"].startswith("oldest 3 of 27 seasons")
    assert len(call(db, "get_champions", {**base, "limit": 99})["seasons"]) == 25
    assert len(call(db, "get_champions", {**base, "limit": 0})["seasons"]) == 1
    rest = call(db, "get_champions", {**base, "year_from": 1985, "limit": None})
    assert [s["year"] for s in rest["seasons"]] == [1985, 1986] and "note" not in rest


def test_compare_drivers_names_shared_team_seasons(db, race_seed_data):
    out = call(db, "compare_drivers", {"a": "max_verstappen", "b": "perez"})
    assert out["sharedTeamSeasons"] == [2023] and "teammateSeasons" not in out


def test_compare_refuses_the_same_ref_in_another_case_or_padding(db, race_seed_data):
    assert "error" in call(db, "compare_drivers", {"a": "Perez", "b": " perez "})
