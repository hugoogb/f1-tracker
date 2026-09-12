"""Lap-by-lap positions.

Two sources, and the endpoint has to pick the right one: Fast-F1's own per-lap
position where it has been stored, and otherwise a reconstruction that ranks
drivers each lap by elapsed race time. The reconstruction needs an unbroken
chain of lap times from lap 1, which makes the chart hostage to gaps in the
timing data — the cases below are the ones that bit.
"""

import datetime

import pytest

from src.db.models import Constructor, Driver, LapTime, Race, RaceResult, Season, Status

RACE_LAPS = 20
LAP_MS = 90_000


@pytest.fixture()
def race(db):
    db.add_all(
        [
            Season(year=2024),
            Status(id=1, description="Finished"),
            Constructor(id="c1", ref="red-bull", name="Red Bull", color="#4781D7"),
        ]
    )
    db.add(
        Race(
            id="2024_01",
            season_year=2024,
            round=1,
            name="Test Grand Prix",
            circuit_id="circuit-1",
            date=datetime.date(2024, 3, 2),
        )
    )
    for i in (1, 2, 3):
        db.add(Driver(id=f"d{i}", ref=f"driver-{i}", first_name="Test", last_name=f"Driver{i}"))
        db.add(
            RaceResult(
                id=f"r{i}",
                race_id="2024_01",
                driver_id=f"d{i}",
                constructor_id="c1",
                grid=i,
                position=i,
                position_text=str(i),
                points=0,
                laps=RACE_LAPS,
                status_id=1,
            )
        )
    db.commit()


def add_laps(db, driver_id, *, offset_ms=0, blank_lap=None, sectors_only_lap=None, position=None):
    """A driver's full race, optionally with one lap's timing degraded.

    `blank_lap` has no time at all; `sectors_only_lap` has the sectors Fast-F1
    recorded but no LapTime, which is the common shape of a gap.
    """
    for lap in range(1, RACE_LAPS + 1):
        third = (LAP_MS + offset_ms) // 3
        db.add(
            LapTime(
                id=f"2024_01_L_{driver_id}_{lap}",
                race_id="2024_01",
                driver_id=driver_id,
                lap_number=lap,
                position=position,
                time_millis=None if lap in (blank_lap, sectors_only_lap) else LAP_MS + offset_ms,
                sector1_ms=third if lap == sectors_only_lap else None,
                sector2_ms=third if lap == sectors_only_lap else None,
                sector3_ms=third if lap == sectors_only_lap else None,
            )
        )
    db.commit()


def _positions(client):
    return client.get("/api/seasons/2024/races/1/positions").json()


def test_sector_times_stand_in_for_a_missing_lap_time(client, seed_data, race, db):
    """One missing LapTime used to cut the driver's line off at the lap before.

    Fast-F1 leaves LapTime empty far more often than the sectors, so the sum of
    the three carries the chain past the gap.
    """
    add_laps(db, "d1", sectors_only_lap=4)
    add_laps(db, "d2", offset_ms=500)
    add_laps(db, "d3", offset_ms=1000)

    by_ref = {d["driver"]["ref"]: d for d in _positions(client)["drivers"]}
    laps = [p["lap"] for p in by_ref["driver-1"]["positions"]]

    assert max(laps) == RACE_LAPS
    # Still leading on the recovered lap: the sectors sum to the same time.
    assert next(p["position"] for p in by_ref["driver-1"]["positions"] if p["lap"] == 4) == 1


def test_a_lap_with_no_timing_at_all_still_truncates_that_driver(client, seed_data, race, db):
    """Honest limit: with no time and no sectors the cumulative total is unknowable."""
    add_laps(db, "d1", blank_lap=4)
    add_laps(db, "d2", offset_ms=500)

    by_ref = {d["driver"]["ref"]: d for d in _positions(client)["drivers"]}

    assert max(p["lap"] for p in by_ref["driver-1"]["positions"]) == 3
    assert max(p["lap"] for p in by_ref["driver-2"]["positions"]) == RACE_LAPS


def test_total_laps_is_the_race_not_the_timing_coverage(client, seed_data, race, db):
    """The axis spans the race even when every driver's data stops early.

    Gaps across the field used to collapse `totalLaps` to a handful, so the
    chart claimed the race was three laps long.
    """
    add_laps(db, "d1", blank_lap=4)
    add_laps(db, "d2", blank_lap=3)
    add_laps(db, "d3", blank_lap=4)

    data = _positions(client)

    assert data["totalLaps"] == RACE_LAPS
    # Reported separately so the UI can flag how short the coverage is.
    assert data["coveredLaps"] == 3


def test_full_timing_covers_the_whole_race(client, seed_data, race, db):
    add_laps(db, "d1")
    add_laps(db, "d2", offset_ms=500)

    data = _positions(client)

    assert data["totalLaps"] == RACE_LAPS
    assert data["coveredLaps"] == RACE_LAPS
    # Grid position is lap 0, then one point per lap.
    assert len(data["drivers"][0]["positions"]) == RACE_LAPS + 1


def test_stored_positions_are_used_verbatim(client, seed_data, race, db):
    """Fast-F1's own position wins over anything derived from lap times.

    Driver 2's laps are slower, so the reconstruction would put them second —
    the stored position says otherwise, and that is what has to come back.
    """
    add_laps(db, "d1", position=2)
    add_laps(db, "d2", offset_ms=5_000, position=1)

    by_ref = {d["driver"]["ref"]: d for d in _positions(client)["drivers"]}

    assert all(p["position"] == 2 for p in by_ref["driver-1"]["positions"] if p["lap"] > 0)
    assert all(p["position"] == 1 for p in by_ref["driver-2"]["positions"] if p["lap"] > 0)


def test_stored_positions_survive_a_lap_with_no_time(client, seed_data, race, db):
    """The gap that truncates the reconstruction does not touch stored positions."""
    add_laps(db, "d1", blank_lap=4, position=1)

    data = _positions(client)

    assert data["coveredLaps"] == RACE_LAPS
    assert data["totalLaps"] == RACE_LAPS
