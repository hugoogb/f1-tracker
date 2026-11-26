"""The direct Fast-F1 ingestors: one loop, driven by `find_targets()`."""

import datetime

import pytest

from src.db.models import Constructor, Driver, QualifyingResult, Race, RaceResult, Season, Status
from src.ingestion import fastf1_ingest


@pytest.fixture()
def races(db, seed_data):
    """2024 R1 has qualifying rows; R2 has none, so it has no sectors to fill."""
    db.add_all(
        [
            Season(year=2024),
            Status(id=1, description="Finished"),
            Constructor(id="c1", ref="red-bull", name="Red Bull"),
            Driver(
                id="d1", ref="max-verstappen", first_name="Max", last_name="Verstappen", code="VER"
            ),
        ]
    )
    for rnd in (1, 2):
        race_id = f"2024_{rnd:02d}"
        db.add(
            Race(
                id=race_id,
                season_year=2024,
                round=rnd,
                name=f"Round {rnd}",
                circuit_id="circuit-1",
                date=datetime.date(2024, 3, rnd),
            )
        )
        db.add(
            RaceResult(
                id=f"r-{rnd}",
                race_id=race_id,
                driver_id="d1",
                constructor_id="c1",
                position=1,
                position_text="1",
                points=25.0,
                status_id=1,
            )
        )
    db.add(
        QualifyingResult(
            id="q-1", race_id="2024_01", driver_id="d1", constructor_id="c1", position=1
        )
    )
    db.commit()


@pytest.fixture()
def calls(monkeypatch):
    log = {"fetched": [], "throttled": []}
    monkeypatch.setattr(fastf1_ingest, "require_f1_account", lambda: None)
    monkeypatch.setattr(
        fastf1_ingest, "throttle", lambda elapsed, **_: log["throttled"].append(elapsed)
    )
    return log


def test_sectors_are_fetched_only_where_there_are_qualifying_rows(db, races, calls, monkeypatch):
    def fetch(year, rnd):
        calls["fetched"].append(rnd)
        return ["VER"], {"VER": {"Q1": {"s1_ms": 30_000, "s2_ms": 31_000, "s3_ms": 32_000}}}, 50.0

    monkeypatch.setattr(fastf1_ingest, "fetch_qualifying_bests", fetch)
    fastf1_ingest.QualifyingSectorIngestor(db).ingest()

    assert calls["fetched"] == [1]
    assert db.get(QualifyingResult, "q-1").q1_s2_ms == 31_000
    fastf1_ingest.QualifyingSectorIngestor(db).ingest()
    assert calls["fetched"] == [1]


def test_every_network_load_is_throttled_even_without_a_driver_mapping(
    db, races, calls, monkeypatch
):
    def fetch(year, rnd):
        calls["fetched"].append(rnd)
        return ["XXX"], [{"driver": "XXX", "lap_number": 1, "time_millis": 90_000}], 50.0

    monkeypatch.setattr(fastf1_ingest, "fetch_race_laps", fetch)
    fastf1_ingest.LapTimeIngestor(db).ingest()

    assert calls["fetched"] == [1, 2]
    assert calls["throttled"] == [50.0, 50.0]


def test_a_failure_after_the_load_is_still_throttled(db, races, calls, monkeypatch):
    monkeypatch.setattr(
        fastf1_ingest,
        "fetch_race_laps",
        lambda year, rnd: (["VER"], [{"driver": "VER", "lap_number": 1}], 50.0),
    )

    def broken_write(*_):
        raise ValueError("bad row")

    monkeypatch.setattr(fastf1_ingest, "write_lap_rows", broken_write)
    fastf1_ingest.LapTimeIngestor(db).ingest()
    assert calls["throttled"] == [50.0, 50.0]
