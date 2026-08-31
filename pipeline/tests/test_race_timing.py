"""Race start-time parsing and serialization.

Regression coverage for a bug where every race in the database had a NULL
``time``: ``_parse_time`` only handled strings and objects exposing a ``.time``
attribute, but Fast-F1's Ergast layer hands back bare ``datetime.time`` objects,
which have neither — so every value silently fell through to ``None``.
"""

import datetime
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

from src.api.serializers import race_timing
from src.db.models import Race
from src.ingestion.races import RaceIngestor, _parse_date, _parse_time


class TestParseTime:
    def test_parses_bare_time_object(self):
        """What fastf1's ``time_from_ergast`` actually returns."""
        assert _parse_time(datetime.time(5, 0)) == datetime.time(5, 0)

    def test_parses_midnight_rather_than_treating_it_as_falsy(self):
        assert _parse_time(datetime.time(0, 0)) == datetime.time(0, 0)

    def test_parses_datetime(self):
        assert _parse_time(datetime.datetime(2025, 3, 16, 5, 0)) == datetime.time(5, 0)

    def test_parses_string(self):
        assert _parse_time("15:00:00") == datetime.time(15, 0)

    def test_none_and_nat_become_none(self):
        assert _parse_time(None) is None
        assert _parse_time(pd.NaT) is None

    def test_unparseable_string_becomes_none(self):
        assert _parse_time("not a time") is None


class TestParseDate:
    def test_parses_datetime_from_ergast(self):
        """``date_from_ergast`` returns a datetime, not a date."""
        assert _parse_date(datetime.datetime(2025, 3, 16, 0, 0)) == datetime.date(2025, 3, 16)

    def test_parses_string(self):
        assert _parse_date("2025-03-16") == datetime.date(2025, 3, 16)

    def test_none_becomes_none(self):
        assert _parse_date(None) is None
        assert _parse_date(pd.NaT) is None


class TestRaceTimingSerializer:
    def test_combines_date_and_time_into_utc_instant(self):
        race = Race(date=datetime.date(2025, 3, 16), time=datetime.time(5, 0))
        assert race_timing(race) == {
            "date": "2025-03-16",
            "time": "05:00:00",
            "startTime": "2025-03-16T05:00:00Z",
        }

    def test_start_time_is_none_without_a_known_time(self):
        """Most of the pre-2005 archive has a date but no published time."""
        race = Race(date=datetime.date(1976, 8, 1), time=None)
        assert race_timing(race) == {
            "date": "1976-08-01",
            "time": None,
            "startTime": None,
        }

    def test_all_none_without_a_date(self):
        race = Race(date=None, time=None)
        assert race_timing(race) == {"date": None, "time": None, "startTime": None}


class TestRaceTimingInApi:
    def test_race_detail_exposes_start_time(self, client, race_seed_data):
        body = client.get("/api/seasons/2023/races/1").json()
        assert body["date"] == "2023-03-05"
        assert body["time"] == "15:00:00"
        assert body["startTime"] == "2023-03-05T15:00:00Z"

    def test_season_races_expose_start_time(self, client, race_seed_data):
        race = client.get("/api/seasons/2023").json()["races"][0]
        assert race["startTime"] == "2023-03-05T15:00:00Z"

    def test_circuit_race_history_exposes_start_time(self, client, race_seed_data):
        race = client.get("/api/circuits/monza").json()["races"][0]
        assert race["startTime"] == "2023-03-05T15:00:00Z"


class TestScheduleBackfill:
    """`--refresh-schedule` re-fetches seasons the ingestor would normally skip.

    Without it, race times can only ever land on the current season: closed
    seasons are skipped, so a schedule field added after they were first loaded
    stays NULL forever.
    """

    @pytest.fixture()
    def closed_season_race(self, seed_data, db):
        """A past-season race stored under the ingestor's own id convention."""
        race = Race(
            id="2023_01",
            season_year=2023,
            round=1,
            name="Bahrain Grand Prix",
            circuit_id="circuit-1",
            date=datetime.date(2023, 3, 5),
            time=None,
            fastest_lap_driver_id="driver-1",
            fastest_lap_time="1:33.996",
        )
        db.add(race)
        db.commit()
        return race

    def _run(self, db, *, refresh_closed):
        schedule = pd.DataFrame(
            [
                {
                    "round": 1,
                    "raceName": "Bahrain Grand Prix",
                    "circuitId": "circuit-1",
                    "raceDate": datetime.datetime(2023, 3, 5),
                    "raceTime": datetime.time(15, 0),
                    "raceUrl": "https://example.com/bahrain",
                }
            ]
        )
        mock_erg = MagicMock()
        mock_erg.get_race_schedule.return_value = schedule
        with patch("src.ingestion.races.Ergast", return_value=mock_erg):
            RaceIngestor(db).ingest(year_range=(2023, 2023), refresh_closed=refresh_closed)
        return mock_erg

    def test_closed_season_is_skipped_by_default(self, db, closed_season_race):
        mock_erg = self._run(db, refresh_closed=False)

        mock_erg.get_race_schedule.assert_not_called()
        assert db.get(Race, "2023_01").time is None

    def test_refresh_closed_backfills_the_start_time(self, db, closed_season_race):
        self._run(db, refresh_closed=True)

        assert db.get(Race, "2023_01").time == datetime.time(15, 0)

    def test_refresh_preserves_precomputed_columns(self, db, closed_season_race):
        """merge() must not null out fields the schedule payload doesn't carry."""
        self._run(db, refresh_closed=True)

        refreshed = db.get(Race, "2023_01")
        assert refreshed.fastest_lap_time == "1:33.996"
        assert refreshed.fastest_lap_driver_id == "driver-1"
