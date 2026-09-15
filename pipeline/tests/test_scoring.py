"""The points systems the championship has used.

These are facts with dates attached, and two features read them, so a wrong
entry would quietly move a championship in the normalisation and mis-size the
points still available in the permutations.
"""

import pytest

from src.scoring import SYSTEMS, sprint_system_for_year, system_for_year


@pytest.mark.parametrize(
    ("year", "expected_id", "win_points"),
    [
        (1950, "1950", 8.0),
        (1959, "1950", 8.0),
        (1960, "1960", 8.0),
        (1961, "1961", 9.0),
        (1990, "1961", 9.0),
        (1991, "1991", 10.0),
        (2002, "1991", 10.0),
        (2003, "2003", 10.0),
        (2009, "2003", 10.0),
        (2010, "2010", 25.0),
        (2018, "2010", 25.0),
        (2019, "2019", 25.0),
        (2024, "2019", 25.0),
        (2025, "2025", 25.0),
        (2026, "2025", 25.0),
    ],
)
def test_system_for_year(year, expected_id, win_points):
    system = system_for_year(year)
    assert system.id == expected_id
    assert system.win_points == win_points


def test_eras_are_contiguous():
    """No year between 1950 and today may fall through the ranges."""
    for year in range(1950, 2031):
        assert system_for_year(year) is not None


def test_points_for_outside_the_scoring_positions_is_zero():
    system = SYSTEMS["1961"]
    assert system.points_for(1) == 9.0
    assert system.points_for(6) == 1.0
    assert system.points_for(7) == 0.0
    assert system.points_for(None) == 0.0
    assert system.points_for(0) == 0.0


def test_fastest_lap_point_history():
    """Paid in the fifties, dropped in 1960, back in 2019, gone again in 2025."""
    assert system_for_year(1955).fastest_lap_point is True
    assert system_for_year(1960).fastest_lap_point is False
    assert system_for_year(2018).fastest_lap_point is False
    assert system_for_year(2021).fastest_lap_point is True
    assert system_for_year(2025).fastest_lap_point is False


def test_fifties_fastest_lap_had_no_finishing_requirement():
    """The top-ten rule is a 2019 invention; 0 means no gate at all."""
    assert system_for_year(1955).fastest_lap_within == 0
    assert system_for_year(2021).fastest_lap_within == 10


def test_sprint_scale_by_year():
    assert sprint_system_for_year(2020) == ()
    assert sprint_system_for_year(2021) == (3.0, 2.0, 1.0)
    assert sprint_system_for_year(2022)[0] == 8.0
    assert len(sprint_system_for_year(2026)) == 8


def test_max_per_round_includes_the_fastest_lap_point():
    assert system_for_year(2021).max_per_round == 26.0
    assert system_for_year(2025).max_per_round == 25.0
