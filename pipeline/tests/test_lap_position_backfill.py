"""Both Fast-F1 paths have to agree on what counts as already loaded.

Lap data reaches the database two ways — `LapTimeIngestor` fetching directly on
a host Fast-F1 answers, and a payload built off-box and loaded by
`scripts/fastf1_import.py`. Per-lap positions were added after races had already
been ingested, so "this race has laps" and "this race has laps *with*
positions" are different questions, and both paths need to be able to ask the
second one. If only one can, a local seed and a `pnpm fastf1` run disagree about
what is left to do.
"""

import datetime

import pytest

from src.db.models import Constructor, Driver, LapTime, Race, RaceResult, Season, Status
from src.ingestion.lap_times import races_with_lap_positions, races_with_lap_times

from scripts.fastf1_status import find_targets  # isort: skip


@pytest.fixture()
def two_races(db):
    """2024 R1 has positions; R2 has laps from before the column existed."""
    db.add_all(
        [
            Season(year=2024),
            Status(id=1, description="Finished"),
            Constructor(id="c1", ref="red-bull", name="Red Bull"),
            Driver(id="d1", ref="max-verstappen", first_name="Max", last_name="Verstappen"),
        ]
    )
    for rnd, position in ((1, 1), (2, None)):
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
                grid=1,
                position=1,
                position_text="1",
                points=25.0,
                laps=57,
                status_id=1,
            )
        )
        db.add(
            LapTime(
                id=f"{race_id}_L_d1_1",
                race_id=race_id,
                driver_id="d1",
                lap_number=1,
                position=position,
                time_millis=90_000,
            )
        )
    db.commit()


def test_the_two_questions_differ(db, seed_data, two_races):
    assert races_with_lap_times(db) == {"2024_01", "2024_02"}
    assert races_with_lap_positions(db) == {"2024_01"}


def test_payload_path_skips_both_by_default(db, seed_data, two_races):
    """The weekly run must not drag a backfill along behind it."""
    targets = find_targets(db, need={"laps"})
    assert [t["race_id"] for t in targets] == []


def test_payload_path_claims_the_position_gap_when_asked(db, seed_data, two_races):
    targets = find_targets(db, need={"laps"}, refresh_positions=True)
    assert [t["race_id"] for t in targets] == ["2024_02"]


def test_direct_ingestor_agrees_on_what_is_outstanding(db, seed_data, two_races, monkeypatch):
    """`seed.py --laptimes --refresh-positions` picks the same race.

    The direct path had no notion of positions at all, so a local seed would
    skip every race that already had laps and could never fill the column in.
    """
    from src.ingestion import lap_times

    attempted: list[str] = []

    def fake_fetch(year, rnd):
        attempted.append(f"{year}_{rnd:02d}")
        return [], [], 0.0  # no data, so nothing is written

    monkeypatch.setattr(lap_times, "fetch_race_laps", fake_fetch)
    monkeypatch.setattr(lap_times, "throttle", lambda *a, **k: None)

    lap_times.LapTimeIngestor(db).ingest(refresh_positions=True)
    assert attempted == ["2024_02"]

    attempted.clear()
    lap_times.LapTimeIngestor(db).ingest()
    assert attempted == []
