"""Championship permutation maths."""

from src.api.championship import (
    FALLBACK_POINTS_FOR_WIN,
    Competitor,
    round_math,
    title_scenarios,
)


def competitors(*points: float) -> list[Competitor]:
    return [Competitor(key=f"c{i}", position=i + 1, points=value) for i, value in enumerate(points)]


class TestRoundMath:
    def test_reads_the_points_system_off_the_season(self):
        """A season's own results state what winning is worth in it."""
        math = round_math(2025, rounds_remaining=5, best_race_score=25, best_sprint_score=8)

        assert math.points_for_win == 25
        assert math.sprint_points_for_win == 8
        assert math.max_points_per_round == 33
        assert math.max_points_remaining == 165

    def test_handles_an_era_before_sprints(self):
        math = round_math(1988, rounds_remaining=3, best_race_score=9, best_sprint_score=None)

        assert math.sprint_points_for_win == 0
        assert math.max_points_per_round == 9

    def test_adds_the_fastest_lap_bonus_in_its_era(self):
        math = round_math(2022, rounds_remaining=1, best_race_score=25, best_sprint_score=8)

        assert math.fastest_lap_bonus == 1
        assert math.max_points_per_round == 34

    def test_no_fastest_lap_bonus_after_it_was_dropped(self):
        assert round_math(2025, 1, 25, 8).fastest_lap_bonus == 0

    def test_no_fastest_lap_bonus_before_it_was_introduced(self):
        assert round_math(2018, 1, 25, None).fastest_lap_bonus == 0

    def test_falls_back_when_the_season_has_no_results_yet(self):
        math = round_math(2026, rounds_remaining=24, best_race_score=None, best_sprint_score=None)

        assert math.points_for_win == FALLBACK_POINTS_FOR_WIN

    def test_never_reports_negative_rounds_remaining(self):
        assert (
            round_math(
                2025, rounds_remaining=-3, best_race_score=25, best_sprint_score=0
            ).rounds_remaining
            == 0
        )


class TestTitleScenarios:
    def test_everyone_within_reach_can_still_win(self):
        math = round_math(2025, rounds_remaining=5, best_race_score=25, best_sprint_score=0)
        result = title_scenarios(competitors(200, 150, 100), math)

        assert [c["canWin"] for c in result["contenders"]] == [True, True, True]
        assert result["decided"] is False

    def test_eliminates_a_competitor_who_cannot_reach_the_leader(self):
        # One round left, 25 on offer, and a 30-point gap.
        math = round_math(2025, rounds_remaining=1, best_race_score=25, best_sprint_score=0)
        result = title_scenarios(competitors(200, 195, 170), math)

        assert [c["canWin"] for c in result["contenders"]] == [True, True, False]
        assert result["contenders"][2]["pointsNeeded"] == 5

    def test_a_gap_exactly_equal_to_what_is_left_is_not_elimination(self):
        """Level on points goes to countback, so arithmetic cannot rule it out."""
        math = round_math(2025, rounds_remaining=1, best_race_score=25, best_sprint_score=0)
        result = title_scenarios(competitors(200, 175), math)

        assert result["contenders"][1]["canWin"] is True
        assert result["contenders"][1]["pointsNeeded"] == 0

    def test_title_is_decided_when_only_the_leader_survives(self):
        math = round_math(2025, rounds_remaining=1, best_race_score=25, best_sprint_score=0)
        result = title_scenarios(competitors(300, 200, 150), math)

        assert result["decided"] is True
        assert result["leader"] == "c0"

    def test_final_standings_leave_only_the_champion(self):
        math = round_math(2025, rounds_remaining=0, best_race_score=25, best_sprint_score=8)
        result = title_scenarios(competitors(423, 410, 390), math)

        assert result["decided"] is True
        assert [c["canWin"] for c in result["contenders"]] == [True, False, False]

    def test_leader_is_always_in_contention(self):
        math = round_math(2025, rounds_remaining=0, best_race_score=25, best_sprint_score=0)
        result = title_scenarios(competitors(100), math)

        assert result["contenders"][0]["canWin"] is True
        assert result["contenders"][0]["isLeader"] is True

    def test_sprint_points_keep_a_contender_alive(self):
        """25 alone is not enough to close 30; a sprint weekend is."""
        without = round_math(2025, 1, best_race_score=25, best_sprint_score=None)
        with_sprint = round_math(2025, 1, best_race_score=25, best_sprint_score=8)

        assert title_scenarios(competitors(200, 170), without)["contenders"][1]["canWin"] is False
        assert (
            title_scenarios(competitors(200, 170), with_sprint)["contenders"][1]["canWin"] is True
        )

    def test_ranks_by_points_regardless_of_stored_position(self):
        math = round_math(2025, 5, 25, 0)
        out_of_order = [
            Competitor(key="a", position=3, points=100),
            Competitor(key="b", position=1, points=250),
        ]

        result = title_scenarios(out_of_order, math)

        assert result["leader"] == "b"
        assert [c["key"] for c in result["contenders"]] == ["b", "a"]

    def test_gap_to_leader_is_reported(self):
        math = round_math(2025, 5, 25, 0)
        result = title_scenarios(competitors(250, 180), math)

        assert result["contenders"][1]["gapToLeader"] == 70

    def test_no_competitors(self):
        result = title_scenarios([], round_math(2025, 5, 25, 0))

        assert result == {"decided": False, "leader": None, "contenders": []}


class TestTitleRaceEndpoint:
    def test_reports_round_accounting(self, client, race_seed_data):
        body = client.get("/api/seasons/2023/title-race").json()

        assert body["year"] == 2023
        assert body["totalRounds"] == 1
        assert body["roundsCompleted"] == 1
        assert body["roundsRemaining"] == 0

    def test_derives_the_points_system_from_the_season(self, client, race_seed_data):
        body = client.get("/api/seasons/2023/title-race").json()

        # The fixture's winner scored 25, and 2023 carried the fastest-lap point.
        assert body["pointsForWin"] == 25
        assert body["fastestLapBonus"] == 1

    def test_lists_drivers_and_constructors(self, client, race_seed_data):
        body = client.get("/api/seasons/2023/title-race").json()

        assert body["drivers"]["contenders"][0]["driver"]["ref"] == "max_verstappen"
        assert body["constructors"]["contenders"][0]["constructor"]["ref"] == "red_bull"

    def test_a_season_with_no_data_is_empty_rather_than_an_error(self, client, seed_data):
        body = client.get("/api/seasons/1999/title-race").json()

        assert body["drivers"]["contenders"] == []
        assert body["constructors"]["contenders"] == []
        assert body["drivers"]["decided"] is False
