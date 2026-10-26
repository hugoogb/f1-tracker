"""The points systems the championship has used.

These are facts with dates attached, and two features read them, so a wrong
entry would quietly move a championship in the normalisation and mis-size the
points still available in the permutations.
"""

import pytest

from src.scoring import (
    SYSTEMS,
    max_per_round,
    max_points_remaining,
    sprint_system_for_year,
    still_in_contention,
    system_for_year,
    wins_countback,
)


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


def test_constructor_maximum_is_a_one_two():
    assert max_per_round(system_for_year(2025), 2025, constructors=True) == 43.0
    assert max_per_round(system_for_year(2021), 2021, constructors=True) == 44.0
    # Best car only until 1978, and the 1950s fastest-lap point predates the title.
    assert max_per_round(system_for_year(1978), 1978, constructors=True) == 9.0
    assert max_per_round(system_for_year(1979), 1979, constructors=True) == 15.0


def test_sprint_maximum_for_a_constructor_is_a_one_two():
    assert max_points_remaining(system_for_year(2025), 0, 1, 2025, constructors=True) == 15.0
    assert max_points_remaining(system_for_year(2021), 0, 1, 2021, constructors=True) == 5.0


def test_double_points_finale_is_counted_once_extra():
    assert max_points_remaining(system_for_year(2014), 3, 0, 2014) == 4 * 25
    assert max_points_remaining(system_for_year(2014), 0, 0, 2014) == 0


def test_wins_countback():
    # Two wins to come against eight: the leader keeps it.
    assert wins_countback([0, 8], [8], 2) is False
    # Level on wins, more seconds.
    assert wins_countback([3, 5], [5, 3], 2) is True
    # Identical records: nothing separates them.
    assert wins_countback([3, 1], [5, 1], 2) is None


def test_drawing_level_follows_the_countback():
    assert still_in_contention(250, 300, 50, countback=False) is False
    assert still_in_contention(250, 300, 50, countback=True) is True
    # Unknown counts as alive rather than ruling anyone out.
    assert still_in_contention(250, 300, 50) is True
    assert still_in_contention(251, 300, 50, countback=False) is True
    assert still_in_contention(249, 300, 50, countback=True) is False
