"""Tests for RaceIngestor schedule reconciliation.

Regression coverage for the 2026 Bahrain/Saudi cancellation: when a race is
cancelled mid-season, the canonical Ergast schedule drops it and renumbers the
remaining rounds. The ingestor must reconcile the stored schedule (remove
cancelled races, fix renumbered rounds) instead of freezing it after the first
seed, otherwise results get attached to the wrong race.
"""

from datetime import date
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

from src.db.models import (
    Circuit,
    Constructor,
    Driver,
    Race,
    RaceResult,
    Season,
)
from src.ingestion.races import RaceIngestor


def _schedule_df(rows: list[tuple[int, str, str, str]]) -> pd.DataFrame:
    """Build an Ergast-shaped race-schedule DataFrame from (round, name, circuit, date)."""
    return pd.DataFrame(
        [
            {
                "round": rnd,
                "raceName": name,
                "circuitId": circuit,
                "raceDate": race_date,
                "raceTime": None,
                "raceUrl": f"https://example.com/{circuit}",
            }
            for rnd, name, circuit, race_date in rows
        ]
    )


def _patched_ingest(db, schedule_df, year_range):
    """Run RaceIngestor with Ergast.get_race_schedule mocked to return schedule_df."""
    mock_erg = MagicMock()
    mock_erg.get_race_schedule.return_value = schedule_df
    with patch("src.ingestion.races.Ergast", return_value=mock_erg):
        RaceIngestor(db).ingest(year_range=year_range)


@pytest.fixture()
def circuits(db):
    refs = [
        "albert_park",
        "shanghai",
        "suzuka",
        "bahrain",
        "jeddah",
        "miami",
        "villeneuve",
        "monaco",
    ]
    for ref in refs:
        db.add(Circuit(id=ref, ref=ref, name=ref.title(), country="X"))
    db.add(Driver(id="drv", ref="drv", first_name="A", last_name="B"))
    db.add(Constructor(id="con", ref="con", name="C"))
    db.add(Season(year=2026, url="https://example.com/2026"))
    db.commit()


def _add_race(db, year, rnd, circuit, race_date, with_result=False):
    rid = f"{year}_{rnd:02d}"
    db.add(
        Race(
            id=rid,
            season_year=year,
            round=rnd,
            name=f"{circuit} GP",
            circuit_id=circuit,
            date=race_date,
        )
    )
    if with_result:
        db.add(
            RaceResult(
                id=f"{rid}_R_drv",
                race_id=rid,
                driver_id="drv",
                constructor_id="con",
                position=1,
                points=25.0,
            )
        )
    db.commit()


def test_cancelled_races_are_removed_and_rounds_realigned(db, circuits):
    """Stale schedule with cancelled Bahrain/Saudi gets reconciled to canonical."""
    # Stale DB schedule: 6 rounds incl. cancelled Bahrain (4) and Saudi (5).
    # Bahrain carries a phantom result; Miami sits at the (soon-to-shift) round 6.
    _add_race(db, 2026, 1, "albert_park", date(2026, 3, 8))
    _add_race(db, 2026, 2, "shanghai", date(2026, 3, 15))
    _add_race(db, 2026, 3, "suzuka", date(2026, 3, 29))
    _add_race(db, 2026, 4, "bahrain", date(2026, 4, 12), with_result=True)
    _add_race(db, 2026, 5, "jeddah", date(2026, 4, 19), with_result=True)
    _add_race(db, 2026, 6, "miami", date(2026, 5, 3))

    # Canonical schedule after cancellation: 4 rounds, Miami shifted 6 -> 4.
    canonical = _schedule_df(
        [
            (1, "Australian GP", "albert_park", "2026-03-08"),
            (2, "Chinese GP", "shanghai", "2026-03-15"),
            (3, "Japanese GP", "suzuka", "2026-03-29"),
            (4, "Miami GP", "miami", "2026-05-03"),
        ]
    )

    _patched_ingest(db, canonical, (2026, 2026))

    races = db.query(Race).filter(Race.season_year == 2026).order_by(Race.round).all()
    round_to_circuit = {r.round: r.circuit_id for r in races}

    # Cancelled races gone, no stale rounds 5/6 left behind.
    assert len(races) == 4
    assert round_to_circuit == {
        1: "albert_park",
        2: "shanghai",
        3: "suzuka",
        4: "miami",
    }
    assert not db.query(Race).filter(Race.circuit_id.in_(["bahrain", "jeddah"])).all()

    # Phantom result on the cancelled Bahrain race is purged.
    assert db.query(RaceResult).count() == 0


def test_schedule_extension_does_not_purge(db, circuits):
    """Appending a newly-added round must NOT wipe existing races/results."""
    _add_race(db, 2026, 1, "albert_park", date(2026, 3, 8), with_result=True)
    _add_race(db, 2026, 2, "shanghai", date(2026, 3, 15))

    canonical = _schedule_df(
        [
            (1, "Australian GP", "albert_park", "2026-03-08"),
            (2, "Chinese GP", "shanghai", "2026-03-15"),
            (3, "Japanese GP", "suzuka", "2026-03-29"),
        ]
    )

    _patched_ingest(db, canonical, (2026, 2026))

    races = db.query(Race).filter(Race.season_year == 2026).order_by(Race.round).all()
    assert len(races) == 3
    # Existing result preserved (no purge for pure additions).
    assert db.query(RaceResult).count() == 1


def test_closed_past_season_is_not_refetched(db, circuits):
    """A fully-completed past season is skipped (schedule never changes)."""
    db.add(Season(year=2023, url="https://example.com/2023"))
    db.commit()
    _add_race(db, 2023, 1, "albert_park", date(2023, 3, 5), with_result=True)

    # Even a divergent schedule must not touch a closed season.
    canonical = _schedule_df([(1, "Different GP", "shanghai", "2023-03-05")])

    mock_erg = MagicMock()
    mock_erg.get_race_schedule.return_value = canonical
    with patch("src.ingestion.races.Ergast", return_value=mock_erg):
        RaceIngestor(db).ingest(year_range=(2023, 2023))

    # Schedule untouched; Ergast never queried for the closed season.
    assert mock_erg.get_race_schedule.call_count == 0
    race = db.query(Race).filter(Race.season_year == 2023).one()
    assert race.circuit_id == "albert_park"
    assert db.query(RaceResult).count() == 1
