"""API coverage for the lap-derived race pace endpoints."""

import pytest

from src.db.models import LapTime


@pytest.fixture()
def race_laps(race_seed_data, db):
    """Two drivers, two stints each, over a 24-lap race.

    driver-1 runs soft then hard; driver-2 the reverse and a second slower.
    """
    plans = {
        "driver-1": [("SOFT", 1, 1, 12, 90_000), ("HARD", 2, 13, 12, 91_000)],
        "driver-2": [("HARD", 1, 1, 12, 90_500), ("SOFT", 2, 13, 12, 91_500)],
    }
    rows = []
    for driver_id, stints in plans.items():
        for compound, stint, start_lap, count, base in stints:
            for i in range(count):
                rows.append(
                    LapTime(
                        id=f"{driver_id}-{start_lap + i}",
                        race_id="race-1",
                        driver_id=driver_id,
                        lap_number=start_lap + i,
                        time_millis=base + 40 * i,
                        compound=compound,
                        stint=stint,
                        tyre_life=i + 1,
                    )
                )
    db.add_all(rows)
    db.commit()


class TestTyreDegradationEndpoint:
    def test_returns_a_curve_per_compound(self, client, race_laps):
        body = client.get("/api/seasons/2023/races/1/tyre-degradation").json()

        compounds = {entry["compound"] for entry in body["compounds"]}
        assert compounds == {"SOFT", "HARD"}
        assert all(entry["points"] for entry in body["compounds"])

    def test_exposes_the_correction_constants(self, client, race_laps):
        """The numbers are modelled, so the model has to be visible."""
        body = client.get("/api/seasons/2023/races/1/tyre-degradation").json()

        assert body["fuelEffectMsPerLap"] == 30
        assert body["cleanLapThreshold"] == 1.07

    def test_points_carry_raw_and_fuel_corrected_medians(self, client, race_laps):
        body = client.get("/api/seasons/2023/races/1/tyre-degradation").json()
        point = body["compounds"][0]["points"][0]

        assert {"tyreLife", "medianMs", "fuelCorrectedMedianMs", "samples"} <= set(point)

    def test_unknown_race_is_404(self, client, race_seed_data):
        assert client.get("/api/seasons/2023/races/99/tyre-degradation").status_code == 404

    def test_race_without_lap_data_returns_an_empty_list(self, client, race_seed_data):
        body = client.get("/api/seasons/2023/races/1/tyre-degradation").json()

        assert body["compounds"] == []


class TestStintsEndpoint:
    def test_lists_stints_per_driver_in_finishing_order(self, client, race_laps):
        body = client.get("/api/seasons/2023/races/1/stints").json()

        assert [entry["position"] for entry in body["drivers"]] == [1, 2]
        assert [s["compound"] for s in body["drivers"][0]["stints"]] == ["SOFT", "HARD"]

    def test_stints_carry_lap_ranges_and_pace(self, client, race_laps):
        body = client.get("/api/seasons/2023/races/1/stints").json()
        first = body["drivers"][0]["stints"][0]

        assert (first["startLap"], first["endLap"], first["laps"]) == (1, 12, 12)
        assert first["medianMs"] > 0
        assert first["bestMs"] > 0

    def test_includes_driver_and_constructor(self, client, race_laps):
        entry = client.get("/api/seasons/2023/races/1/stints").json()["drivers"][0]

        assert entry["driver"]["ref"] == "max_verstappen"
        assert entry["constructor"]["name"] == "Red Bull"

    def test_unknown_race_is_404(self, client, race_seed_data):
        assert client.get("/api/seasons/2023/races/99/stints").status_code == 404

    def test_race_without_lap_data_returns_no_drivers(self, client, race_seed_data):
        assert client.get("/api/seasons/2023/races/1/stints").json()["drivers"] == []


class TestGapsEndpoint:
    def test_reports_total_laps_and_a_series_per_driver(self, client, race_laps):
        body = client.get("/api/seasons/2023/races/1/gaps").json()

        assert body["totalLaps"] == 24
        assert len(body["drivers"]) == 2
        assert all(len(entry["gaps"]) == 24 for entry in body["drivers"])

    def test_leader_gap_starts_at_zero(self, client, race_laps):
        body = client.get("/api/seasons/2023/races/1/gaps").json()
        leader = body["drivers"][0]

        assert leader["gaps"][0]["gapMs"] == 0

    def test_drivers_are_ordered_by_finishing_position(self, client, race_laps):
        body = client.get("/api/seasons/2023/races/1/gaps").json()

        assert [entry["position"] for entry in body["drivers"]] == [1, 2]

    def test_unknown_race_is_404(self, client, race_seed_data):
        assert client.get("/api/seasons/2023/races/99/gaps").status_code == 404

    def test_race_without_lap_data_returns_zero_laps(self, client, race_seed_data):
        body = client.get("/api/seasons/2023/races/1/gaps").json()

        assert body["totalLaps"] == 0
        assert body["drivers"] == []
