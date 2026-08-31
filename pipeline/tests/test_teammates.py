"""Intra-team head-to-head counting."""

from src.api.teammates import Entry, is_classified, teammate_battles


def entry(race, team, driver, position=None, position_text=None, points=0.0, quali=None):
    """A result row. `position_text` defaults to the position, i.e. classified."""
    if position_text is None and position is not None:
        position_text = str(position)
    return Entry(
        race_id=race,
        constructor_id=team,
        driver_id=driver,
        position=position,
        position_text=position_text,
        points=points,
        quali_position=quali,
    )


def pairing(entries, team="t1"):
    return teammate_battles(entries)[team][0]


class TestIsClassified:
    def test_a_numeric_position_text_is_a_finish(self):
        assert is_classified("7") is True

    def test_retired_withdrawn_and_disqualified_are_not(self):
        assert is_classified("R") is False
        assert is_classified("W") is False
        assert is_classified("D") is False

    def test_missing_text_is_not_classified(self):
        assert is_classified(None) is False
        assert is_classified("") is False


class TestTeammateBattles:
    def test_counts_race_wins_between_teammates(self):
        entries = [
            entry("r1", "t1", "a", position=1),
            entry("r1", "t1", "b", position=4),
            entry("r2", "t1", "a", position=5),
            entry("r2", "t1", "b", position=2),
            entry("r3", "t1", "a", position=2),
            entry("r3", "t1", "b", position=3),
        ]

        result = pairing(entries)

        assert result["race"] == {"a": 2, "b": 1, "compared": 3}
        assert result["sharedRaces"] == 3

    def test_a_retirement_is_excluded_rather_than_awarded(self):
        """A driver retiring says nothing about which was quicker."""
        entries = [
            entry("r1", "t1", "a", position=19, position_text="R"),
            entry("r1", "t1", "b", position=5),
            entry("r2", "t1", "a", position=1),
            entry("r2", "t1", "b", position=2),
        ]

        result = pairing(entries)

        assert result["race"] == {"a": 1, "b": 0, "compared": 1}
        # The round still counts as one they shared.
        assert result["sharedRaces"] == 2

    def test_both_retiring_is_excluded(self):
        entries = [
            entry("r1", "t1", "a", position=18, position_text="R"),
            entry("r1", "t1", "b", position=19, position_text="R"),
        ]

        assert pairing(entries)["race"]["compared"] == 0

    def test_counts_qualifying_separately_from_the_race(self):
        entries = [
            entry("r1", "t1", "a", position=5, quali=2),
            entry("r1", "t1", "b", position=3, quali=8),
        ]

        result = pairing(entries)

        assert result["race"] == {"a": 0, "b": 1, "compared": 1}
        assert result["qualifying"] == {"a": 1, "b": 0, "compared": 1}

    def test_qualifying_counts_even_when_the_race_does_not(self):
        """Out-qualifying a teammate stands whatever happened on Sunday."""
        entries = [
            entry("r1", "t1", "a", position=20, position_text="R", quali=3),
            entry("r1", "t1", "b", position=8, quali=11),
        ]

        result = pairing(entries)

        assert result["race"]["compared"] == 0
        assert result["qualifying"] == {"a": 1, "b": 0, "compared": 1}

    def test_missing_qualifying_data_is_skipped(self):
        entries = [
            entry("r1", "t1", "a", position=1, quali=None),
            entry("r1", "t1", "b", position=2, quali=4),
        ]

        assert pairing(entries)["qualifying"]["compared"] == 0

    def test_drivers_in_different_teams_are_not_teammates(self):
        entries = [
            entry("r1", "t1", "a", position=1),
            entry("r1", "t2", "b", position=2),
        ]

        assert teammate_battles(entries) == {}

    def test_accumulates_points_per_driver_for_that_team(self):
        entries = [
            entry("r1", "t1", "a", position=1, points=25),
            entry("r1", "t1", "b", position=3, points=15),
            entry("r2", "t1", "a", position=2, points=18),
            entry("r2", "t1", "b", position=4, points=12),
        ]

        result = pairing(entries)

        assert result["pointsA"] == 43
        assert result["pointsB"] == 27

    def test_tracks_each_driver_best_finish(self):
        entries = [
            entry("r1", "t1", "a", position=6),
            entry("r1", "t1", "b", position=9),
            entry("r2", "t1", "a", position=2),
            entry("r2", "t1", "b", position=1, position_text="R"),
        ]

        result = pairing(entries)

        assert result["bestFinishA"] == 2
        # b's only classified finish was ninth; the "1" was a retirement.
        assert result["bestFinishB"] == 9

    def test_a_mid_season_swap_produces_two_pairings(self):
        entries = [
            entry("r1", "t1", "a", position=1),
            entry("r1", "t1", "b", position=2),
            entry("r2", "t1", "a", position=1),
            entry("r2", "t1", "c", position=5),
        ]

        pairings = teammate_battles(entries)["t1"]

        assert len(pairings) == 2
        assert {(p["driverAId"], p["driverBId"]) for p in pairings} == {("a", "b"), ("a", "c")}

    def test_pairings_are_ordered_by_races_shared(self):
        entries = [entry(f"r{i}", "t1", "a", position=1) for i in range(5)]
        entries += [entry(f"r{i}", "t1", "b", position=2) for i in range(5)]
        entries += [entry("r0", "t1", "c", position=3)]

        pairings = teammate_battles(entries)["t1"]

        assert [p["sharedRaces"] for p in pairings] == [5, 1, 1]

    def test_a_pair_is_counted_once_regardless_of_row_order(self):
        forwards = [entry("r1", "t1", "a", position=1), entry("r1", "t1", "b", position=2)]
        backwards = list(reversed(forwards))

        assert teammate_battles(forwards) == teammate_battles(backwards)

    def test_a_solo_entry_produces_no_pairing(self):
        assert teammate_battles([entry("r1", "t1", "a", position=1)]) == {}

    def test_no_entries(self):
        assert teammate_battles([]) == {}


class TestTeammatesEndpoint:
    def test_returns_pairings_for_a_season(self, client, race_seed_data):
        body = client.get("/api/seasons/2023/teammates").json()

        assert body["year"] == 2023
        # The fixture puts both drivers in Red Bull for the same race.
        assert len(body["teams"]) == 1
        team = body["teams"][0]
        assert team["constructor"]["ref"] == "red_bull"
        assert team["pairings"][0]["sharedRaces"] == 1

    def test_pairing_carries_both_drivers(self, client, race_seed_data):
        pairing = client.get("/api/seasons/2023/teammates").json()["teams"][0]["pairings"][0]

        refs = {pairing["a"]["driver"]["ref"], pairing["b"]["driver"]["ref"]}
        assert refs == {"max_verstappen", "perez"}

    def test_counts_the_race_and_qualifying_battles(self, client, race_seed_data):
        pairing = client.get("/api/seasons/2023/teammates").json()["teams"][0]["pairings"][0]

        assert pairing["race"]["compared"] == 1
        assert pairing["qualifying"]["compared"] == 1

    def test_a_season_with_no_results(self, client, seed_data):
        body = client.get("/api/seasons/1999/teammates").json()

        assert body == {"year": 1999, "teams": []}
