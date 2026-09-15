"""Gap-to-leader and tyre degradation.

Both read the same Fast-F1 lap data the positions chart does, and both inherit
its awkward edges: a missing lap breaks a cumulative total, and a pit or
safety-car lap is several seconds off the pace, which is far more than the
effect being measured.
"""

import datetime

import pytest

from src.db.models import Constructor, Driver, LapTime, Race, RaceResult, Season, Status

RACE_LAPS = 10
LEADER_LAP_MS = 90_000


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
    for i in (1, 2):
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


def add_laps(db, driver_id, *, lap_ms, laps=RACE_LAPS, blank_lap=None, compound=None):
    for lap in range(1, laps + 1):
        time_ms = None if lap == blank_lap else lap_ms
        db.add(
            LapTime(
                id=f"L_{driver_id}_{lap}",
                race_id="2024_01",
                driver_id=driver_id,
                lap_number=lap,
                time_millis=time_ms,
                compound=compound,
                tyre_life=lap if compound else None,
            )
        )
    db.commit()


# --- gaps -------------------------------------------------------------------


def test_gap_to_leader_grows_by_the_pace_difference(client, db, race):
    add_laps(db, "d1", lap_ms=LEADER_LAP_MS)
    add_laps(db, "d2", lap_ms=LEADER_LAP_MS + 500)

    body = client.get("/api/seasons/2024/races/1/gaps").json()
    by_ref = {d["driver"]["ref"]: d["gaps"] for d in body["drivers"]}

    # The leader is its own reference, so its line sits flat on zero.
    assert {g["gapMs"] for g in by_ref["driver-1"]} == {0}
    # Half a second a lap, ten laps.
    assert by_ref["driver-2"][0]["gapMs"] == 500
    assert by_ref["driver-2"][-1]["gapMs"] == 5_000


def test_gaps_are_measured_against_whoever_is_actually_quickest(client, db, race):
    """The reference is the lowest elapsed time, not the classified winner."""
    add_laps(db, "d1", lap_ms=LEADER_LAP_MS + 500)
    add_laps(db, "d2", lap_ms=LEADER_LAP_MS)

    body = client.get("/api/seasons/2024/races/1/gaps").json()
    by_ref = {d["driver"]["ref"]: d["gaps"] for d in body["drivers"]}

    assert {g["gapMs"] for g in by_ref["driver-2"]} == {0}
    assert by_ref["driver-1"][-1]["gapMs"] == 5_000


def test_a_missing_lap_ends_that_driver_line(client, db, race):
    """A cumulative total cannot skip a lap, so the line stops at the hole."""
    add_laps(db, "d1", lap_ms=LEADER_LAP_MS)
    add_laps(db, "d2", lap_ms=LEADER_LAP_MS, blank_lap=4)

    body = client.get("/api/seasons/2024/races/1/gaps").json()
    by_ref = {d["driver"]["ref"]: d["gaps"] for d in body["drivers"]}

    assert by_ref["driver-2"][-1]["lap"] == 3
    assert by_ref["driver-1"][-1]["lap"] == RACE_LAPS


def test_gaps_report_the_race_distance_and_the_data_reach_separately(client, db, race):
    add_laps(db, "d1", lap_ms=LEADER_LAP_MS, laps=6)
    add_laps(db, "d2", lap_ms=LEADER_LAP_MS, laps=6)

    body = client.get("/api/seasons/2024/races/1/gaps").json()
    assert body["totalLaps"] == RACE_LAPS
    assert body["coveredLaps"] == 6


def test_gaps_for_a_race_with_no_timing_data(client, db, race):
    body = client.get("/api/seasons/2024/races/1/gaps").json()
    assert body["drivers"] == []
    assert body["coveredLaps"] == 0


def test_gaps_for_an_unknown_race_is_404(client, db, race):
    assert client.get("/api/seasons/2024/races/99/gaps").status_code == 404


# --- degradation ------------------------------------------------------------


def add_stint(db, driver_id, compound, times_by_age, *, start_lap=2):
    for offset, (age, time_ms) in enumerate(times_by_age):
        db.add(
            LapTime(
                id=f"L_{driver_id}_{compound}_{age}_{offset}",
                race_id="2024_01",
                driver_id=driver_id,
                lap_number=start_lap + offset,
                time_millis=time_ms,
                compound=compound,
                tyre_life=age,
            )
        )
    db.commit()


def test_degradation_slope_is_milliseconds_per_lap_of_tyre_age(client, db, race):
    """A tyre losing 100ms a lap should report exactly that."""
    add_stint(db, "d1", "SOFT", [(age, 90_000 + age * 100) for age in range(1, 11)])

    body = client.get("/api/seasons/2024/races/1/degradation").json()
    soft = next(c for c in body["compounds"] if c["compound"] == "SOFT")

    assert soft["degradationMsPerLap"] == pytest.approx(100.0, abs=0.5)
    assert soft["laps"] == 10
    assert soft["points"][0] == {"tyreLife": 1, "medianMs": 90_100, "sampleSize": 1}


def test_degradation_separates_compounds(client, db, race):
    add_stint(db, "d1", "SOFT", [(age, 90_000 + age * 200) for age in range(1, 6)])
    add_stint(db, "d2", "HARD", [(age, 91_000 + age * 50) for age in range(1, 6)], start_lap=8)

    body = client.get("/api/seasons/2024/races/1/degradation").json()
    by_compound = {c["compound"]: c for c in body["compounds"]}

    assert by_compound["SOFT"]["degradationMsPerLap"] == pytest.approx(200.0, abs=1)
    assert by_compound["HARD"]["degradationMsPerLap"] == pytest.approx(50.0, abs=1)


def test_a_pit_lap_does_not_drag_the_slope(client, db, race):
    """One 25-second pit lap is an order of magnitude bigger than degradation."""
    clean = [(age, 90_000 + age * 100) for age in range(1, 11)]
    add_stint(db, "d1", "SOFT", clean)
    add_stint(db, "d2", "SOFT", [(11, 115_000)], start_lap=12)

    body = client.get("/api/seasons/2024/races/1/degradation").json()
    soft = next(c for c in body["compounds"] if c["compound"] == "SOFT")

    assert soft["degradationMsPerLap"] == pytest.approx(100.0, abs=0.5)
    assert body["totalLaps"] == 11
    assert body["cleanLaps"] == 10


def test_lap_one_is_excluded(client, db, race):
    """A standing start is not a measurement of a one-lap-old tyre."""
    db.add(
        LapTime(
            id="L_d1_1",
            race_id="2024_01",
            driver_id="d1",
            lap_number=1,
            time_millis=95_000,
            compound="SOFT",
            tyre_life=1,
        )
    )
    add_stint(db, "d1", "SOFT", [(age, 90_000) for age in range(2, 6)])

    body = client.get("/api/seasons/2024/races/1/degradation").json()
    soft = next(c for c in body["compounds"] if c["compound"] == "SOFT")

    assert soft["laps"] == 4
    assert all(p["tyreLife"] > 1 for p in soft["points"])


def test_degradation_slope_is_undefined_for_a_single_tyre_age(client, db, race):
    """One age gives a vertical line, which is not a gradient."""
    add_stint(db, "d1", "SOFT", [(5, 90_000)])
    add_stint(db, "d2", "SOFT", [(5, 90_100)], start_lap=6)

    body = client.get("/api/seasons/2024/races/1/degradation").json()
    soft = next(c for c in body["compounds"] if c["compound"] == "SOFT")

    assert soft["degradationMsPerLap"] is None
    assert soft["points"][0]["sampleSize"] == 2


def test_degradation_for_a_race_with_no_timing_data(client, db, race):
    body = client.get("/api/seasons/2024/races/1/degradation").json()
    assert body["compounds"] == []
    assert body["thresholdMs"] is None


def test_degradation_for_an_unknown_race_is_404(client, db, race):
    assert client.get("/api/seasons/2024/races/99/degradation").status_code == 404
