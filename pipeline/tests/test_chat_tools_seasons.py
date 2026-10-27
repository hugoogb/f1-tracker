import json

import src.chat.tools  # noqa: F401
from src.chat.constants import MAX_TOOL_RESULT_CHARS
from src.chat.tools.registry import run_tool, tool_label


def _run(db, name, args):
    return json.loads(run_tool(db, name, args))


def test_get_standings_is_the_official_table_with_hrefs(db, race_seed_data):
    out = _run(db, "get_standings", {"year": 2023, "kind": "drivers", "focus_ref": None})
    assert out["href"] == "/seasons/2023"
    assert out["asOfRound"]["href"] == "/seasons/2023/races/1"
    row = out["standings"][0]
    assert {"position", "name", "ref", "points", "wins", "href"} <= set(row)
    assert row["ref"] == "max_verstappen"
    assert row["constructor"] == "Red Bull"
    assert row["href"] == "/drivers/max_verstappen"
    assert "official" in out["note"]
    assert len(json.dumps(out)) < MAX_TOOL_RESULT_CHARS


def test_get_standings_constructors(db, race_seed_data):
    out = _run(db, "get_standings", {"year": 2023, "kind": "constructors", "focus_ref": None})
    assert out["standings"][0]["href"] == "/constructors/red_bull"


def test_get_standings_caps_at_ten_rows_plus_the_focused_entity(db, race_seed_data):
    out = _run(db, "get_standings", {"year": 2023, "kind": "drivers", "focus_ref": "perez"})
    assert len(out["standings"]) <= 11
    assert any(r["ref"] == "perez" for r in out["standings"])
    ignored = _run(db, "get_standings", {"year": 2023, "kind": "drivers", "focus_ref": "nobody"})
    assert "error" not in ignored


def test_get_standings_adds_a_focus_row_outside_the_top_ten(db, race_seed_data):
    from src.db.models import Driver, DriverStanding

    for i in range(12):
        db.add(Driver(id=f"x{i}", ref=f"x{i}", first_name="X", last_name=str(i)))
        db.add(DriverStanding(race_id="race-1", driver_id=f"x{i}", points=1, position=3 + i))
    db.commit()
    out = _run(db, "get_standings", {"year": 2023, "kind": "drivers", "focus_ref": "x11"})
    assert len(out["standings"]) == 11
    assert out["standings"][-1]["ref"] == "x11"


def test_get_standings_without_rows_is_an_error_result(db, seed_data):
    out = _run(db, "get_standings", {"year": 2023, "kind": "drivers", "focus_ref": None})
    assert "no drivers standings for 2023" in out["error"]


def test_get_season_names_the_champion_and_scoring(db, race_seed_data):
    out = _run(db, "get_season", {"year": 2023})
    assert out["href"] == "/seasons/2023" and "scoring" in out and out["rounds"] == 1
    assert out["completedRounds"] == 1
    assert out["champion"] == {
        "name": "Max Verstappen",
        "ref": "max_verstappen",
        "href": "/drivers/max_verstappen",
    }
    assert out["constructorsChampion"]["ref"] == "red_bull"
    assert {"system", "allResultsCounted", "note"} <= set(out["scoring"])


def test_get_calendar_lists_every_round_with_a_race_href(db, race_seed_data):
    out = _run(db, "get_calendar", {"year": 2023})
    first = out["rounds"][0]
    assert first["href"] == "/seasons/2023/races/1"
    assert first["circuit"] == "Autodromo Nazionale di Monza"
    assert first["winner"] == {"name": "Max Verstappen", "ref": "max_verstappen"}
    assert out["href"] == "/seasons/2023"


def test_progression_and_permutations_answer_for_a_seeded_season(db, race_seed_data):
    prog = _run(db, "get_progression", {"year": 2023, "kind": "drivers"})
    assert prog["leaderAfterRound"][0]["ref"] == "max_verstappen"
    assert prog["leadChanges"] == 0
    perm = _run(db, "get_title_permutations", {"year": 2023, "kind": "drivers"})
    assert perm["href"] == "/seasons/2023"
    assert perm["decided"] is True  # the only round is the last
    assert [c["ref"] for c in perm["contenders"]] == ["max_verstappen"]
    assert perm["contenders"][0]["needs"] == "champion"


def test_constructor_variants(db, race_seed_data):
    prog = _run(db, "get_progression", {"year": 2023, "kind": "constructors"})
    assert prog["leaderAfterRound"][0]["leader"] == "Red Bull"
    perm = _run(db, "get_title_permutations", {"year": 2023, "kind": "constructors"})
    assert perm["contenders"][0]["name"] == "Red Bull"


def test_pre_constructors_permutations_is_an_error_result(db):
    out = _run(db, "get_title_permutations", {"year": 1950, "kind": "constructors"})
    assert "error" in out


def test_unknown_season_is_an_error_result_not_a_404(db):
    assert "error" in _run(db, "get_season", {"year": 1930})
    assert "error" in _run(db, "get_calendar", {"year": 1930})
    assert "error" in _run(db, "get_progression", {"year": 1930, "kind": "drivers"})


def test_labels():
    drivers = {"year": 2024, "kind": "drivers", "focus_ref": None}
    assert tool_label("get_standings", drivers) == "2024 standings"
    assert tool_label("get_season", {"year": 2024}) == "2024 season"
    assert tool_label("get_calendar", {"year": 2024}) == "2024 calendar"
    assert tool_label("get_progression", {"year": 2024, "kind": "drivers"}) == "2024 progression"
    perm = tool_label("get_title_permutations", {"year": 2024, "kind": "drivers"})
    assert perm == "2024 title permutations"


def test_a_full_season_fits_the_result_budget(db, race_seed_data):
    import datetime

    from src.db.models import Race, RaceResult

    for rnd in range(2, 25):
        db.add(
            Race(
                id=f"race-{rnd}",
                season_year=2023,
                round=rnd,
                name=f"Grand Prix Number {rnd} of the Season",
                circuit_id="circuit-1",
                date=datetime.date(2023, 3, 5) + datetime.timedelta(days=7 * rnd),
            )
        )
        db.add(
            RaceResult(
                id=f"res-{rnd}",
                race_id=f"race-{rnd}",
                driver_id="driver-1",
                constructor_id="constructor-1",
                grid=1,
                position=1,
                position_text="1",
                points=25.0,
                status_id=1,
            )
        )
    db.commit()
    for name, args in [
        ("get_calendar", {"year": 2023}),
        ("get_season", {"year": 2023}),
        ("get_progression", {"year": 2023, "kind": "drivers"}),
    ]:
        raw = run_tool(db, name, args)
        assert "truncated" not in raw, name
        assert len(raw) < MAX_TOOL_RESULT_CHARS, (name, len(raw))
    assert len(json.loads(run_tool(db, "get_calendar", {"year": 2023}))["rounds"]) == 24
