"""Grand Prix weekend session schedule.

The Ergast schedule call the race ingestor already makes carries every session
of the weekend; before this it kept only the race and discarded the rest.
"""

import datetime
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

from src.api.serializers import weekend_sessions
from src.db.models import Race, RaceSession
from src.ingestion.races import RaceIngestor, _parse_sessions


def schedule_row(**overrides):
    row = {
        "round": 1,
        "raceName": "Italian Grand Prix",
        "circuitId": "circuit-1",
        "raceDate": datetime.datetime(2026, 9, 6),
        "raceTime": datetime.time(13, 0),
        "raceUrl": "https://example.com/italy",
        "fp1Date": datetime.datetime(2026, 9, 4),
        "fp1Time": datetime.time(9, 30),
        "fp2Date": datetime.datetime(2026, 9, 4),
        "fp2Time": datetime.time(13, 0),
        "fp3Date": datetime.datetime(2026, 9, 5),
        "fp3Time": datetime.time(8, 30),
        "qualifyingDate": datetime.datetime(2026, 9, 5),
        "qualifyingTime": datetime.time(12, 0),
        "sprintDate": None,
        "sprintTime": None,
    }
    row.update(overrides)
    return row


class TestParseSessions:
    def test_reads_every_session_of_a_normal_weekend(self):
        sessions = _parse_sessions("2026_01", schedule_row())

        assert [s["kind"] for s in sessions] == ["FP1", "FP2", "FP3", "QUALIFYING"]
        assert sessions[0]["date"] == datetime.date(2026, 9, 4)
        assert sessions[0]["time"] == datetime.time(9, 30)

    def test_skips_sessions_a_weekend_does_not_hold(self):
        """A sprint weekend runs no FP2 or FP3."""
        row = schedule_row(
            fp2Date=None,
            fp2Time=None,
            fp3Date=None,
            fp3Time=None,
            sprintDate=datetime.datetime(2026, 9, 5),
            sprintTime=datetime.time(10, 0),
        )

        assert [s["kind"] for s in _parse_sessions("2026_01", row)] == [
            "FP1",
            "SPRINT",
            "QUALIFYING",
        ]

    def test_a_session_with_a_date_but_no_time_is_kept(self):
        row = schedule_row(fp1Time=None)
        fp1 = next(s for s in _parse_sessions("2026_01", row) if s["kind"] == "FP1")

        assert fp1["date"] == datetime.date(2026, 9, 4)
        assert fp1["time"] is None

    def test_ids_are_stable_across_runs(self):
        first = _parse_sessions("2026_01", schedule_row())
        second = _parse_sessions("2026_01", schedule_row())

        assert [s["id"] for s in first] == [s["id"] for s in second]

    def test_a_schedule_with_no_session_columns(self):
        """The pre-2000s archive lists a race date and nothing else."""
        row = {"raceDate": datetime.datetime(1976, 8, 1)}

        assert _parse_sessions("1976_10", row) == []


class TestWeekendSessionsSerializer:
    def race(self, date=datetime.date(2026, 9, 6), time=datetime.time(13, 0)):
        return Race(
            id="2026_13", season_year=2026, round=13, name="Italian GP", date=date, time=time
        )

    def session(self, kind, day, hour):
        return RaceSession(
            id=f"s-{kind}",
            race_id="2026_13",
            kind=kind,
            date=datetime.date(2026, 9, day),
            time=datetime.time(hour, 0),
        )

    def test_appends_the_race_to_the_stored_sessions(self):
        sessions = weekend_sessions(self.race(), [self.session("FP1", 4, 9)])

        assert [s["kind"] for s in sessions] == ["FP1", "RACE"]

    def test_orders_sessions_chronologically(self):
        stored = [
            self.session("QUALIFYING", 5, 12),
            self.session("FP1", 4, 9),
            self.session("FP3", 5, 8),
        ]

        assert [s["kind"] for s in weekend_sessions(self.race(), stored)] == [
            "FP1",
            "FP3",
            "QUALIFYING",
            "RACE",
        ]

    def test_a_sprint_weekend_puts_qualifying_before_the_sprint(self):
        """Sprint weekends qualify on Friday, which the canonical order gets wrong."""
        stored = [
            self.session("SPRINT", 5, 10),
            self.session("QUALIFYING", 4, 13),
            self.session("FP1", 4, 9),
        ]

        assert [s["kind"] for s in weekend_sessions(self.race(), stored)] == [
            "FP1",
            "QUALIFYING",
            "SPRINT",
            "RACE",
        ]

    def test_carries_a_readable_label_and_a_utc_instant(self):
        [fp1, _] = weekend_sessions(self.race(), [self.session("FP1", 4, 9)])

        assert fp1["label"] == "Practice 1"
        assert fp1["startTime"] == "2026-09-04T09:00:00Z"

    def test_a_race_with_no_time_still_appears(self):
        sessions = weekend_sessions(self.race(time=None), [])

        assert sessions[0]["kind"] == "RACE"
        assert sessions[0]["startTime"] is None


@pytest.fixture()
def ingested_schedule(seed_data, db):
    frame = pd.DataFrame([schedule_row()])
    mock_erg = MagicMock()
    mock_erg.get_race_schedule.return_value = frame
    with patch("src.ingestion.races.Ergast", return_value=mock_erg):
        RaceIngestor(db).ingest(year_range=(2023, 2023))
    return db


class TestIngestion:
    def test_stores_the_weekend_sessions_with_the_race(self, ingested_schedule, db):
        kinds = {s.kind for s in db.query(RaceSession).all()}

        assert kinds == {"FP1", "FP2", "FP3", "QUALIFYING"}

    def test_re_ingesting_does_not_duplicate_sessions(self, ingested_schedule, db):
        before = db.query(RaceSession).count()

        frame = pd.DataFrame([schedule_row()])
        mock_erg = MagicMock()
        mock_erg.get_race_schedule.return_value = frame
        with patch("src.ingestion.races.Ergast", return_value=mock_erg):
            RaceIngestor(db).ingest(year_range=(2023, 2023), refresh_closed=True)

        assert db.query(RaceSession).count() == before


class TestRaceDetailEndpoint:
    def test_race_detail_carries_the_weekend_schedule(self, client, race_seed_data, db):
        db.add(
            RaceSession(
                id="s1",
                race_id="race-1",
                kind="QUALIFYING",
                date=datetime.date(2023, 3, 4),
                time=datetime.time(15, 0),
            )
        )
        db.commit()

        body = client.get("/api/seasons/2023/races/1").json()

        assert [s["kind"] for s in body["sessions"]] == ["QUALIFYING", "RACE"]

    def test_a_race_with_no_stored_sessions_still_lists_itself(self, client, race_seed_data):
        body = client.get("/api/seasons/2023/races/1").json()

        assert [s["kind"] for s in body["sessions"]] == ["RACE"]
