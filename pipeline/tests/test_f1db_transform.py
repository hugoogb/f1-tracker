"""Unit tests for the f1db transform helpers."""

import pytest

from src.ingestion.f1db import F1DBData, _release_url
from src.ingestion.races import _parse_date, _parse_time, race_id
from src.ingestion.results import _as_int, average_speed_kph
from src.ingestion.seasons import _format_years


class TestAverageSpeed:
    def test_matches_ergast_definition(self):
        """Ergast's average speed is lap distance / lap time.

        2024 Bahrain: 5.412 km course, Verstappen's 1:32.608 fastest lap.
        """
        assert average_speed_kph(5.412, 92608) == "210.384"

    @pytest.mark.parametrize(
        "length,millis",
        [(None, 92608), (5.412, None), (5.412, 0), (0, 92608), (None, None)],
    )
    def test_missing_inputs_yield_none(self, length, millis):
        assert average_speed_kph(length, millis) is None


class TestFormatYears:
    @pytest.mark.parametrize(
        "years,expected",
        [
            ({1950}, "1950"),
            ({1950, 1951, 1952}, "1950-1952"),
            ({1950, 1952}, "1950,1952"),
            # Matches the hand-maintained table this replaced (Austin).
            ({*range(2012, 2020), *range(2021, 2027)}, "2012-2019,2021-2026"),
            (set(), ""),
        ],
    )
    def test_collapses_to_ranges(self, years, expected):
        assert _format_years(years) == expected


class TestRaceParsing:
    def test_race_id_is_zero_padded(self):
        assert race_id(2024, 1) == "2024_01"
        assert race_id(1950, 13) == "1950_13"

    @pytest.mark.parametrize("value", ["15:00", "15:00:00", "15:00Z"])
    def test_parses_start_times(self, value):
        assert _parse_time(value).hour == 15

    @pytest.mark.parametrize("value", [None, "", "not-a-time"])
    def test_bad_times_yield_none(self, value):
        assert _parse_time(value) is None

    def test_parses_dates(self):
        assert str(_parse_date("2024-03-02")) == "2024-03-02"
        assert _parse_date(None) is None
        assert _parse_date("nonsense") is None

    def test_driver_numbers_may_be_strings(self):
        """f1db serialises car numbers as strings."""
        assert _as_int("44") == 44
        assert _as_int(44) == 44
        assert _as_int(None) is None
        assert _as_int("") is None


class TestF1DBData:
    @pytest.fixture()
    def data(self):
        return F1DBData(
            {
                "countries": [
                    {
                        "id": "united-kingdom",
                        "alpha2Code": "GB",
                        "name": "United Kingdom",
                        "demonym": "British",
                    }
                ],
                "grandsPrix": [
                    {"id": "bahrain", "name": "Bahrain", "fullName": "Bahrain Grand Prix"}
                ],
                "races": [
                    {"id": "1", "year": 2023, "round": 1},
                    {"id": "2", "year": 2024, "round": 1},
                    {"id": "3", "year": 2025, "round": 1},
                ],
            }
        )

    def test_country_lookups(self, data):
        """Nationality and country code come straight from f1db's country entity."""
        assert data.nationality("united-kingdom") == "British"
        assert data.alpha2("united-kingdom") == "GB"
        assert data.country_name("united-kingdom") == "United Kingdom"

    def test_unknown_country_is_none(self, data):
        assert data.nationality("atlantis") is None
        assert data.alpha2(None) is None

    def test_grand_prix_name_prefers_full_name(self, data):
        assert data.grand_prix_name("bahrain") == "Bahrain Grand Prix"
        assert data.grand_prix_name("nope") is None

    def test_races_filtered_by_year_range(self, data):
        assert len(data.races_for(None)) == 3
        assert [r["year"] for r in data.races_for((2024, 2025))] == [2024, 2025]
        assert data.races_for((1990, 1991)) == []


class TestReleaseUrl:
    def test_latest_uses_the_moving_tag(self):
        assert _release_url("latest").endswith("/releases/latest/download/f1db-json-single.zip")

    def test_pinned_version_normalises_the_v_prefix(self):
        assert "/download/v2026.5.0/" in _release_url("2026.5.0")
        assert "/download/v2026.5.0/" in _release_url("v2026.5.0")
