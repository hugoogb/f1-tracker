"""Race-pace analysis derived from lap times."""

import pytest

from src.api.lap_analysis import (
    FUEL_EFFECT_MS_PER_LAP,
    LapSample,
    degradation_by_compound,
    fuel_corrected_ms,
    gaps_to_leader,
    normalize_compound,
    representative_laps,
    stint_summary,
)


def lap(driver="d1", number=1, time_ms=90_000, compound="SOFT", stint=1, tyre_life=1):
    return LapSample(
        driver_id=driver,
        lap_number=number,
        time_ms=time_ms,
        compound=compound,
        stint=stint,
        tyre_life=tyre_life,
    )


def stint_laps(driver, stint, compound, start_lap, count, base_ms, per_lap=0, first_life=1):
    """A contiguous stint whose lap time grows by `per_lap` each lap."""
    return [
        lap(
            driver=driver,
            number=start_lap + i,
            time_ms=base_ms + per_lap * i,
            compound=compound,
            stint=stint,
            tyre_life=first_life + i,
        )
        for i in range(count)
    ]


class TestNormalizeCompound:
    @pytest.mark.parametrize("value", ["nan", "None", "UNKNOWN", "", "   ", "null", None])
    def test_placeholder_values_become_none(self, value):
        """Fast-F1 stored these strings verbatim rather than as NULL."""
        assert normalize_compound(value) is None

    def test_upper_cases_and_trims(self):
        assert normalize_compound(" soft ") == "SOFT"


class TestFuelCorrection:
    def test_early_laps_are_penalised_for_carrying_fuel(self):
        # 56 laps still to run at lap 1 of a 57-lap race.
        assert fuel_corrected_ms(90_000, 1, 57) == 90_000 - 56 * FUEL_EFFECT_MS_PER_LAP

    def test_final_lap_is_unchanged(self):
        assert fuel_corrected_ms(90_000, 57, 57) == 90_000

    def test_never_credits_laps_beyond_the_race(self):
        assert fuel_corrected_ms(90_000, 60, 57) == 90_000


class TestRepresentativeLaps:
    def test_drops_out_and_in_laps(self):
        laps = stint_laps("d1", 1, "SOFT", start_lap=1, count=5, base_ms=90_000)
        kept = {lap.lap_number for lap in representative_laps(laps)}

        assert kept == {2, 3, 4}

    def test_drops_untimed_laps(self):
        laps = stint_laps("d1", 1, "SOFT", 1, 5, 90_000)
        laps[2] = LapSample("d1", 3, None, "SOFT", 1, 3)

        assert 3 not in {lap.lap_number for lap in representative_laps(laps)}

    def test_drops_laps_without_a_known_compound(self):
        laps = stint_laps("d1", 1, "nan", 1, 5, 90_000)

        assert representative_laps(laps) == []

    def test_drops_laps_slower_than_the_threshold(self):
        """A safety-car lap should not count as race pace."""
        laps = stint_laps("d1", 1, "SOFT", 1, 9, 90_000)
        laps[4] = lap(number=5, time_ms=140_000, stint=1, tyre_life=5)
        kept = {lap.lap_number for lap in representative_laps(laps)}

        assert 5 not in kept
        assert kept == {2, 3, 4, 6, 7, 8}

    def test_empty_input(self):
        assert representative_laps([]) == []


class TestDegradationByCompound:
    def test_reports_positive_degradation_once_fuel_is_accounted_for(self):
        """A stint with flat raw times is really degrading: the car got lighter.

        This is the case that made the first cut of this feature report soft
        tyres getting *faster* with age.
        """
        laps = stint_laps("d1", 1, "SOFT", start_lap=1, count=30, base_ms=90_000, per_lap=0)
        [entry] = degradation_by_compound(laps)

        assert entry["rawTrendMsPerLap"] == 0
        assert entry["degradationMsPerLap"] == pytest.approx(FUEL_EFFECT_MS_PER_LAP, abs=1)

    def test_recovers_a_known_degradation_rate(self):
        laps = stint_laps("d1", 1, "HARD", start_lap=1, count=30, base_ms=90_000, per_lap=50)
        [entry] = degradation_by_compound(laps)

        assert entry["rawTrendMsPerLap"] == pytest.approx(50, abs=1)
        assert entry["degradationMsPerLap"] == pytest.approx(50 + FUEL_EFFECT_MS_PER_LAP, abs=1)

    def test_curve_is_ordered_by_tyre_age(self):
        laps = stint_laps("d1", 1, "SOFT", 1, 25, 90_000, per_lap=20)
        [entry] = degradation_by_compound(laps)
        ages = [point["tyreLife"] for point in entry["points"]]

        assert ages == sorted(ages)
        assert all(point["samples"] >= 1 for point in entry["points"])

    def test_withholds_a_slope_from_a_thin_sample(self):
        """Five laps of an unusual compound must not produce a confident number."""
        laps = stint_laps("d1", 1, "SOFT", 1, 30, 90_000)
        laps += stint_laps("d1", 2, "INTERMEDIATE", 31, 6, 95_000, per_lap=400)

        entries = {entry["compound"]: entry for entry in degradation_by_compound(laps)}

        assert entries["INTERMEDIATE"]["degradationMsPerLap"] is None
        assert entries["INTERMEDIATE"]["samples"] < 20
        assert entries["SOFT"]["degradationMsPerLap"] is not None

    def test_orders_compounds_fastest_first(self):
        laps = stint_laps("d1", 1, "HARD", 1, 25, 92_000)
        laps += stint_laps("d1", 2, "SOFT", 26, 25, 90_000)

        assert [e["compound"] for e in degradation_by_compound(laps)] == ["SOFT", "HARD"]

    def test_no_lap_data(self):
        assert degradation_by_compound([]) == []


class TestStintSummary:
    def test_summarises_each_stint(self):
        laps = stint_laps("d1", 1, "SOFT", start_lap=1, count=12, base_ms=90_000, per_lap=40)
        laps += stint_laps("d1", 2, "HARD", start_lap=13, count=14, base_ms=91_000, per_lap=20)

        stints = stint_summary(laps)["d1"]

        assert [s["stint"] for s in stints] == [1, 2]
        assert stints[0]["compound"] == "SOFT"
        assert (stints[0]["startLap"], stints[0]["endLap"], stints[0]["laps"]) == (1, 12, 12)
        assert (stints[1]["startLap"], stints[1]["endLap"], stints[1]["laps"]) == (13, 26, 14)

    def test_lap_count_covers_the_whole_stint_not_just_clean_laps(self):
        """The lap range must match what happened, even though pace excludes edges."""
        laps = stint_laps("d1", 1, "SOFT", 1, 10, 90_000)
        stint = stint_summary(laps)["d1"][0]

        assert stint["laps"] == 10
        assert stint["startLap"] == 1
        assert stint["endLap"] == 10

    def test_withholds_a_slope_from_a_short_stint(self):
        laps = stint_laps("d1", 1, "SOFT", 1, 4, 90_000, per_lap=50)

        assert stint_summary(laps)["d1"][0]["degradationMsPerLap"] is None

    def test_separates_drivers(self):
        laps = stint_laps("d1", 1, "SOFT", 1, 10, 90_000)
        laps += stint_laps("d2", 1, "HARD", 1, 10, 91_000)

        summary = stint_summary(laps)

        assert set(summary) == {"d1", "d2"}
        assert summary["d2"][0]["compound"] == "HARD"


class TestGapsToLeader:
    def test_leader_is_flat_at_zero(self):
        laps = [lap("leader", n, 90_000, tyre_life=n) for n in range(1, 6)]
        laps += [lap("chaser", n, 91_000, tyre_life=n) for n in range(1, 6)]

        gaps, total = gaps_to_leader(laps)

        assert total == 5
        assert [g["gapMs"] for g in gaps["leader"]] == [0, 0, 0, 0, 0]

    def test_gap_accumulates(self):
        laps = [lap("leader", n, 90_000, tyre_life=n) for n in range(1, 4)]
        laps += [lap("chaser", n, 91_000, tyre_life=n) for n in range(1, 4)]

        gaps, _ = gaps_to_leader(laps)

        assert [g["gapMs"] for g in gaps["chaser"]] == [1_000, 2_000, 3_000]

    def test_lead_can_change_hands(self):
        laps = [
            lap("a", 1, 90_000),
            lap("b", 1, 92_000),
            lap("a", 2, 95_000),
            lap("b", 2, 90_000),
        ]
        gaps, _ = gaps_to_leader(laps)

        assert gaps["a"][0]["gapMs"] == 0
        assert gaps["b"][0]["gapMs"] == 2_000
        # b is now ahead on cumulative time: 182s against a's 185s.
        assert gaps["a"][1]["gapMs"] == 3_000
        assert gaps["b"][1]["gapMs"] == 0

    def test_retirement_ends_the_series(self):
        laps = [lap("leader", n, 90_000) for n in range(1, 6)]
        laps += [lap("retiree", n, 91_000) for n in range(1, 3)]

        gaps, total = gaps_to_leader(laps)

        assert total == 5
        assert [g["lap"] for g in gaps["retiree"]] == [1, 2]

    def test_a_timing_dropout_does_not_end_the_series(self):
        """One untimed lap used to discard the rest of the driver's race."""
        laps = [lap("leader", n, 90_000) for n in range(1, 11)]
        laps += [lap("other", n, 91_000) for n in range(1, 11)]
        # Same driver, lap 5 present but untimed.
        laps = [
            LapSample("other", 5, None, "SOFT", 1, 5)
            if (x.driver_id, x.lap_number) == ("other", 5)
            else x
            for x in laps
        ]

        gaps, _ = gaps_to_leader(laps)

        assert [g["lap"] for g in gaps["other"]] == list(range(1, 11))

    def test_dropout_is_filled_with_the_field_median(self):
        laps = [lap("leader", n, 90_000) for n in range(1, 4)]
        laps += [lap("other", n, 90_000) for n in range(1, 4)]
        laps = [
            LapSample("other", 2, None, "SOFT", 1, 2)
            if (x.driver_id, x.lap_number) == ("other", 2)
            else x
            for x in laps
        ]

        gaps, _ = gaps_to_leader(laps)

        # The only other lap-2 time is the leader's 90s, so the fill is exact
        # and the gap stays at zero rather than drifting.
        assert [g["gapMs"] for g in gaps["other"]] == [0, 0, 0]

    def test_no_lap_data(self):
        assert gaps_to_leader([]) == ({}, 0)
