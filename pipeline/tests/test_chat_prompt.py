import datetime

from src.chat.prompt import SYSTEM, page_description, user_turn


def test_system_prompt_is_stable_and_states_the_data_rules():
    for phrase in ("official", "what-if", "Fast-F1", "1958", "lineage", "navigate", "search"):
        assert phrase in SYSTEM
    assert "2026" not in SYSTEM and "Today" not in SYSTEM


def test_user_turn_carries_date_path_and_title():
    turn = user_turn(
        "Who leads?",
        path="/seasons/2024",
        page_title="2024 Season",
        today=datetime.date(2026, 10, 26),
    )
    assert turn.startswith("[Today: 2026-10-26. The reader is on the 2024 season page")
    assert "(/seasons/2024)" in turn and turn.endswith("Who leads?")


def test_page_description_knows_the_main_routes():
    assert page_description("/seasons/2024/races/5") == "the 2024 round 5 race page"
    assert page_description("/drivers/lewis-hamilton") == "the driver page for lewis-hamilton"
    assert page_description("/whatever") == "a page of F1 Tracker"
