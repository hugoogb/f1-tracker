"""Tests for the off-box Fast-F1 path.

Formula 1 blocks the VPS's IP, so lap times and qualifying sectors are fetched
on another host and carried to the database as a payload. That splits one
process into three pieces that can now disagree with each other, so each is
covered here: what the parser makes of a session, what survives the payload
round trip, and what the writers put in the database.
"""

import datetime
import gzip
import json

import pandas as pd
import pytest

from scripts.fastf1_import import import_record
from scripts.fastf1_status import find_targets
from src.db.models import LapTime, QualifyingResult, Race, Season
from src.ingestion.base import build_abbr_to_driver_id, race_entrant_codes
from src.ingestion.fastf1_payload import (
    KIND_LAPS,
    KIND_QUALI_SECTORS,
    SCHEMA_VERSION,
    PayloadError,
    SessionRecord,
    payload_writer,
    read_payload,
)
from src.ingestion.fastf1_sessions import (
    extract_qualifying_bests,
    extract_race_laps,
    session_abbreviations,
)
from src.ingestion.lap_times import write_lap_rows
from src.ingestion.qualifying_sectors import write_quali_sectors

# --- Fast-F1 stand-ins -------------------------------------------------------
# Only the surface the extractors touch: a session has `laps` and `results`,
# laps iterate as rows and qualifying laps split into three segments.


class _Laps:
    def __init__(self, frame: pd.DataFrame, segments: list | None = None):
        self._frame = frame
        self._segments = segments

    @property
    def empty(self) -> bool:
        return self._frame.empty

    def iterrows(self):
        return self._frame.iterrows()

    def split_qualifying_sessions(self):
        if self._segments is None:
            raise RuntimeError("not a qualifying session")
        return self._segments


class _Session:
    def __init__(self, laps: _Laps, results: pd.DataFrame | None = None):
        self.laps = laps
        self.results = results


def _lap(driver, lap_number, lap_time, s1, s2, s3, compound="SOFT", stint=1, tyre_life=3):
    return {
        "Driver": driver,
        "LapNumber": lap_number,
        "LapTime": pd.Timedelta(seconds=lap_time) if lap_time is not None else pd.NaT,
        "Sector1Time": pd.Timedelta(seconds=s1) if s1 is not None else pd.NaT,
        "Sector2Time": pd.Timedelta(seconds=s2) if s2 is not None else pd.NaT,
        "Sector3Time": pd.Timedelta(seconds=s3) if s3 is not None else pd.NaT,
        "Compound": compound,
        "Stint": stint,
        "TyreLife": tyre_life,
    }


# --- Parsing -----------------------------------------------------------------


def test_extract_race_laps_converts_timedeltas_to_millis():
    session = _Session(
        _Laps(
            pd.DataFrame(
                [
                    _lap("VER", 1, 92.5, 30.0, 31.5, 31.0),
                    _lap("PER", 1, 93.25, 30.5, 31.75, 31.0, compound="MEDIUM", stint=2),
                ]
            )
        )
    )

    rows = extract_race_laps(session)

    assert [r["driver"] for r in rows] == ["VER", "PER"]
    assert rows[0]["time_millis"] == 92500
    assert rows[0]["sector1_ms"] == 30000
    assert rows[0]["compound"] == "SOFT"
    assert rows[1]["stint"] == 2
    # JSON-safe: the payload has to survive json.dumps untouched.
    json.dumps(rows)


def test_extract_race_laps_keeps_laps_without_a_time():
    """An outlap or a lap under red flag has no LapTime but still has tyre data."""
    session = _Session(_Laps(pd.DataFrame([_lap("VER", 1, None, None, None, None)])))

    rows = extract_race_laps(session)

    assert len(rows) == 1
    assert rows[0]["time_millis"] is None
    assert rows[0]["compound"] == "SOFT"


def test_extract_race_laps_skips_rows_without_a_lap_number():
    session = _Session(
        _Laps(
            pd.DataFrame(
                [
                    _lap("VER", None, 92.5, 30.0, 31.5, 31.0),
                    _lap("VER", 2, 92.0, 30.0, 31.0, 31.0),
                ]
            )
        )
    )

    rows = extract_race_laps(session)

    assert [r["lap_number"] for r in rows] == [2]


def test_extract_qualifying_bests_keeps_the_fastest_lap_per_segment():
    q1 = pd.DataFrame(
        [
            _lap("VER", 1, 91.0, 30.0, 31.0, 30.0),
            _lap("VER", 2, 90.0, 29.5, 30.5, 30.0),  # faster — this one wins
            _lap("PER", 1, 92.0, 30.5, 31.0, 30.5),
        ]
    )
    q2 = pd.DataFrame([_lap("VER", 5, 89.5, 29.0, 30.5, 30.0)])
    q3 = pd.DataFrame([])
    session = _Session(_Laps(pd.DataFrame([]), segments=[q1, q2, q3]))
    # `empty` is checked on the whole frame first, so give it content.
    session.laps = _Laps(pd.concat([q1, q2]), segments=[q1, q2, q3])

    bests = extract_qualifying_bests(session)

    assert bests["VER"]["Q1"]["lap_ms"] == 90000
    assert bests["VER"]["Q1"]["s1_ms"] == 29500
    assert bests["VER"]["Q2"]["lap_ms"] == 89500
    assert "Q3" not in bests["VER"]
    assert bests["PER"]["Q1"]["lap_ms"] == 92000


def test_extract_qualifying_bests_ignores_laps_without_a_time():
    q1 = pd.DataFrame([_lap("VER", 1, None, None, None, None)])
    session = _Session(_Laps(q1, segments=[q1, pd.DataFrame([]), pd.DataFrame([])]))

    assert extract_qualifying_bests(session) == {}


def test_session_abbreviations_reads_the_classification():
    session = _Session(
        _Laps(pd.DataFrame([])),
        results=pd.DataFrame([{"Abbreviation": "VER"}, {"Abbreviation": "PER"}]),
    )

    assert session_abbreviations(session) == ["VER", "PER"]


# --- Payload round trip ------------------------------------------------------


def _record(kind=KIND_LAPS, year=2023, rnd=1):
    if kind == KIND_LAPS:
        return SessionRecord(
            kind=kind,
            year=year,
            round=rnd,
            race_id="race-1",
            abbrs=["VER", "PER"],
            rows=[
                {
                    "driver": "VER",
                    "lap_number": 1,
                    "time_millis": 92500,
                    "sector1_ms": 30000,
                    "sector2_ms": 31500,
                    "sector3_ms": 31000,
                    "compound": "SOFT",
                    "stint": 1,
                    "tyre_life": 3,
                }
            ],
        )
    return SessionRecord(
        kind=kind,
        year=year,
        round=rnd,
        race_id="race-1",
        abbrs=["VER"],
        bests={"VER": {"Q3": {"s1_ms": 29000, "s2_ms": 30500, "s3_ms": 30000, "lap_ms": 89500}}},
    )


@pytest.mark.parametrize("name", ["payload.ndjson.gz", "payload.ndjson"])
def test_payload_round_trip(tmp_path, name):
    path = tmp_path / name
    written = [_record(KIND_LAPS), _record(KIND_QUALI_SECTORS)]

    with payload_writer(path, source="test") as write:
        for record in written:
            write(record)

    read_back = list(read_payload(path))

    assert [r.kind for r in read_back] == [KIND_LAPS, KIND_QUALI_SECTORS]
    assert read_back[0].rows == written[0].rows
    assert read_back[0].race_id == "race-1"
    assert read_back[1].bests == written[1].bests


def test_gz_payload_is_actually_compressed(tmp_path):
    path = tmp_path / "payload.ndjson.gz"
    with payload_writer(path, source="test") as write:
        write(_record())

    assert path.read_bytes()[:2] == b"\x1f\x8b"
    assert b'"kind":"laps"' in gzip.decompress(path.read_bytes())


def test_payload_is_streamed_so_a_partial_fetch_is_still_readable(tmp_path):
    """A fetch killed by the rate limit must leave a usable file behind."""
    path = tmp_path / "payload.ndjson"
    with pytest.raises(RuntimeError):
        with payload_writer(path, source="test") as write:
            write(_record(KIND_LAPS, rnd=1))
            raise RuntimeError("rate limited")

    assert [r.round for r in read_payload(path)] == [1]


def test_payload_rejects_a_foreign_schema(tmp_path):
    path = tmp_path / "payload.ndjson"
    path.write_text(json.dumps({"kind": "header", "schema": SCHEMA_VERSION + 1}) + "\n")

    with pytest.raises(PayloadError, match="schema"):
        list(read_payload(path))


def test_payload_rejects_a_missing_header(tmp_path):
    path = tmp_path / "payload.ndjson"
    path.write_text(_record().to_json() + "\n")

    with pytest.raises(PayloadError, match="header"):
        list(read_payload(path))


def test_payload_rejects_an_unknown_kind(tmp_path):
    path = tmp_path / "payload.ndjson"
    with payload_writer(path, source="test") as write:
        write(_record())
    path.write_text(
        path.read_text() + json.dumps({"kind": "telemetry", "year": 2023, "round": 1}) + "\n"
    )

    with pytest.raises(PayloadError, match="kind"):
        list(read_payload(path))


# --- Writers -----------------------------------------------------------------


def _abbr_map(db, race_id="race-1"):
    return build_abbr_to_driver_id(["VER", "PER"], race_entrant_codes(db, race_id))


def test_race_entrant_codes_scopes_to_the_race(db, race_seed_data):
    codes = race_entrant_codes(db, "race-1")

    assert codes == {"VER": "driver-1", "PER": "driver-2"}


def test_build_abbr_to_driver_id_drops_codes_from_other_eras(db, race_seed_data):
    mapping = build_abbr_to_driver_id(["VER", "HUL"], race_entrant_codes(db, "race-1"))

    assert mapping == {"VER": "driver-1"}


def test_write_lap_rows_stores_laps(db, race_seed_data):
    rows = _record(KIND_LAPS).rows + [
        {"driver": "PER", "lap_number": 1, "time_millis": 93250, "compound": "MEDIUM"}
    ]

    written = write_lap_rows(db, "race-1", rows, _abbr_map(db))
    db.commit()

    assert written == 2
    stored = db.query(LapTime).order_by(LapTime.driver_id).all()
    assert len(stored) == 2
    assert stored[0].time_millis == 92500
    assert stored[0].sector2_ms == 31500
    assert stored[1].compound == "MEDIUM"
    # Columns the caller left out stay null rather than raising.
    assert stored[1].stint is None


def test_write_lap_rows_is_idempotent(db, race_seed_data):
    rows = _record(KIND_LAPS).rows

    write_lap_rows(db, "race-1", rows, _abbr_map(db))
    db.commit()
    write_lap_rows(db, "race-1", rows, _abbr_map(db))
    db.commit()

    assert db.query(LapTime).count() == 1


def test_write_lap_rows_skips_drivers_not_in_this_race(db, race_seed_data):
    rows = [{"driver": "SEN", "lap_number": 1, "time_millis": 92500}]

    written = write_lap_rows(db, "race-1", rows, _abbr_map(db))
    db.commit()

    assert written == 0
    assert db.query(LapTime).count() == 0


def test_write_quali_sectors_fills_existing_rows(db, race_seed_data):
    bests = {
        "VER": {
            "Q1": {"s1_ms": 30000, "s2_ms": 31000, "s3_ms": 30000, "lap_ms": 91000},
            "Q3": {"s1_ms": 29000, "s2_ms": 30500, "s3_ms": 30000, "lap_ms": 89500},
        },
        "SEN": {"Q1": {"s1_ms": 1, "s2_ms": 1, "s3_ms": 1, "lap_ms": 3}},
    }

    updated = write_quali_sectors(db, "race-1", bests, _abbr_map(db))
    db.commit()

    assert updated == 1
    quali = db.query(QualifyingResult).filter_by(driver_id="driver-1").one()
    assert quali.q1_s1_ms == 30000
    assert quali.q3_s1_ms == 29000
    assert quali.q2_s1_ms is None  # no Q2 in the payload
    # The qualifying row itself is untouched apart from the sector columns.
    assert quali.q3 == "1:29.708"
    other = db.query(QualifyingResult).filter_by(driver_id="driver-2").one()
    assert other.q1_s1_ms is None


def test_write_quali_sectors_without_qualifying_rows_is_a_no_op(db, race_seed_data):
    db.query(QualifyingResult).delete()
    db.commit()

    assert write_quali_sectors(db, "race-1", {"VER": {"Q1": {"lap_ms": 1}}}, _abbr_map(db)) == 0


# --- Target list -------------------------------------------------------------


def test_find_targets_lists_races_missing_both_kinds(db, race_seed_data):
    targets = find_targets(db, need={KIND_LAPS, KIND_QUALI_SECTORS})

    assert len(targets) == 1
    assert targets[0]["race_id"] == "race-1"
    assert targets[0]["year"] == 2023
    assert targets[0]["need"] == [KIND_LAPS, KIND_QUALI_SECTORS]


def test_find_targets_drops_what_is_already_loaded(db, race_seed_data):
    write_lap_rows(db, "race-1", _record(KIND_LAPS).rows, _abbr_map(db))
    db.commit()

    targets = find_targets(db, need={KIND_LAPS, KIND_QUALI_SECTORS})

    assert targets[0]["need"] == [KIND_QUALI_SECTORS]

    write_quali_sectors(
        db,
        "race-1",
        {"VER": {"Q1": {"s1_ms": 1, "s2_ms": 2, "s3_ms": 3, "lap_ms": 6}}},
        _abbr_map(db),
    )
    db.commit()

    assert find_targets(db, need={KIND_LAPS, KIND_QUALI_SECTORS}) == []


def test_find_targets_ignores_races_that_have_not_happened(db, race_seed_data):
    db.add(
        Race(
            id="race-2",
            season_year=2023,
            round=2,
            name="Future Grand Prix",
            circuit_id="circuit-1",
            date=datetime.date.today() + datetime.timedelta(days=7),
        )
    )
    db.commit()

    assert [t["race_id"] for t in find_targets(db, need={KIND_LAPS})] == ["race-1"]


def test_find_targets_ignores_seasons_before_fast_f1(db, race_seed_data):
    db.add(Season(year=2010))
    db.add(
        Race(
            id="race-old",
            season_year=2010,
            round=1,
            name="Old Grand Prix",
            circuit_id="circuit-1",
            date=datetime.date(2010, 3, 14),
        )
    )
    db.commit()

    assert [t["race_id"] for t in find_targets(db, need={KIND_LAPS})] == ["race-1"]


def test_find_targets_honours_the_limit_and_order(db, race_seed_data):
    db.add(
        Race(
            id="race-2",
            season_year=2023,
            round=2,
            name="Second Grand Prix",
            circuit_id="circuit-1",
            date=datetime.date(2023, 3, 19),
        )
    )
    db.commit()

    newest = find_targets(db, need={KIND_LAPS}, limit=1)
    oldest = find_targets(db, need={KIND_LAPS}, limit=1, oldest_first=True)

    assert [t["race_id"] for t in newest] == ["race-2"]
    assert [t["race_id"] for t in oldest] == ["race-1"]


# --- Importer ----------------------------------------------------------------


def test_import_record_loads_laps(db, race_seed_data):
    race_id, written = import_record(db, _record(KIND_LAPS))

    assert (race_id, written) == ("race-1", 1)
    assert db.query(LapTime).count() == 1


def test_import_record_loads_quali_sectors(db, race_seed_data):
    race_id, written = import_record(db, _record(KIND_QUALI_SECTORS))

    assert (race_id, written) == ("race-1", 1)
    assert db.query(QualifyingResult).filter_by(driver_id="driver-1").one().q3_s1_ms == 29000


def test_import_record_falls_back_to_year_and_round(db, race_seed_data):
    """A payload built without the database carries no race id, and one built
    before a schedule change may carry a stale one."""
    record = _record(KIND_LAPS)
    record.race_id = "race-from-another-database"

    race_id, written = import_record(db, record)

    assert race_id == "race-1"
    assert written == 1


def test_import_record_skips_a_race_this_database_does_not_have(db, race_seed_data):
    record = _record(KIND_LAPS, year=2099, rnd=9)
    record.race_id = None

    assert import_record(db, record) == (None, 0)
    assert db.query(LapTime).count() == 0


def test_import_record_skips_a_session_whose_drivers_are_unknown(db, race_seed_data):
    record = _record(KIND_LAPS)
    record.abbrs = ["SEN", "PRO"]

    assert import_record(db, record) == (None, 0)
    assert db.query(LapTime).count() == 0
