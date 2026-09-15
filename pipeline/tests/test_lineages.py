"""Constructor lineages.

f1db describes a rebrand as a new constructor plus a `chronology` chain shared
by every member of it. The cases below are the ones the real release actually
contains — including a team that holds two separate slots in its own chain,
which is what made the obvious unique key the wrong one.
"""

import datetime

import pytest

from src.db.models import (
    Constructor,
    ConstructorLineage,
    ConstructorStanding,
    Race,
    RaceResult,
    Season,
    Status,
)
from src.ingestion import lineages as lineages_module
from src.ingestion.lineages import ConstructorLineageIngestor


def chronology(*members: tuple[str, int, int | None]) -> list[dict]:
    return [
        {"positionDisplayOrder": i, "constructorId": ref, "yearFrom": start, "yearTo": end}
        for i, (ref, start, end) in enumerate(members, start=1)
    ]


class FakeF1DB:
    def __init__(self, constructors):
        self.constructors = constructors


@pytest.fixture()
def load_f1db(monkeypatch):
    """Swap the release download for a hand-built payload."""

    def _install(constructors):
        monkeypatch.setattr(lineages_module.f1db, "load", lambda *a, **k: FakeF1DB(constructors))

    return _install


STEWART_CHAIN = chronology(
    ("stewart", 1997, 1999), ("jaguar", 2000, 2004), ("red-bull", 2005, None)
)
# Sauber is in its own chain twice, either side of the BMW years.
SAUBER_CHAIN = chronology(
    ("sauber", 1993, 2005),
    ("bmw-sauber", 2006, 2010),
    ("sauber", 2011, 2018),
    ("audi", 2026, None),
)


@pytest.fixture()
def constructors(db):
    for ref in ("stewart", "jaguar", "red-bull", "sauber", "bmw-sauber", "audi", "williams"):
        db.add(Constructor(id=ref, ref=ref, name=ref.title()))
    db.commit()


def test_ingest_stores_a_chain_in_order(db, constructors, load_f1db):
    load_f1db([{"id": "stewart", "chronology": STEWART_CHAIN}])

    ConstructorLineageIngestor(db).ingest()

    rows = db.query(ConstructorLineage).order_by(ConstructorLineage.position).all()
    assert [r.constructor_id for r in rows] == ["stewart", "jaguar", "red-bull"]
    assert [r.lineage_ref for r in rows] == ["stewart"] * 3
    assert rows[0].year_from == 1997
    # The member still racing has an open-ended end.
    assert rows[-1].year_to is None


def test_a_chain_arriving_once_per_member_is_stored_once(db, constructors, load_f1db):
    """Every member carries the whole chain, so the payload repeats it."""
    load_f1db(
        [
            {"id": "stewart", "chronology": STEWART_CHAIN},
            {"id": "jaguar", "chronology": STEWART_CHAIN},
            {"id": "red-bull", "chronology": STEWART_CHAIN},
        ]
    )

    ConstructorLineageIngestor(db).ingest()

    assert db.query(ConstructorLineage).count() == 3


def test_a_constructor_can_hold_two_slots_in_its_own_chain(db, constructors, load_f1db):
    load_f1db([{"id": "sauber", "chronology": SAUBER_CHAIN}])

    ConstructorLineageIngestor(db).ingest()

    sauber_slots = (
        db.query(ConstructorLineage).filter(ConstructorLineage.constructor_id == "sauber").all()
    )
    assert len(sauber_slots) == 2
    assert sorted(s.year_from for s in sauber_slots) == [1993, 2011]


def test_a_constructor_that_never_changed_name_gets_no_chain(db, constructors, load_f1db):
    """A one-entry chronology says the team kept its name; that is not a lineage."""
    load_f1db(
        [
            {"id": "williams", "chronology": chronology(("williams", 1977, None))},
            {"id": "jaguar", "chronology": None},
        ]
    )

    ConstructorLineageIngestor(db).ingest()

    assert db.query(ConstructorLineage).count() == 0


def test_ingest_rebuilds_rather_than_accumulating(db, constructors, load_f1db):
    """The table is derived, so a chain f1db drops has to disappear."""
    load_f1db([{"id": "stewart", "chronology": STEWART_CHAIN}])
    ConstructorLineageIngestor(db).ingest()
    assert db.query(ConstructorLineage).count() == 3

    load_f1db([{"id": "sauber", "chronology": SAUBER_CHAIN}])
    ConstructorLineageIngestor(db).ingest()

    rows = db.query(ConstructorLineage).all()
    assert len(rows) == 4
    assert {r.lineage_ref for r in rows} == {"sauber"}


def test_ingest_skips_a_member_that_is_not_a_constructor(db, constructors, load_f1db):
    """A chain can name a team the release does not carry as an entrant."""
    load_f1db(
        [
            {
                "id": "stewart",
                "chronology": chronology(
                    ("stewart", 1997, 1999), ("not-a-constructor", 2000, 2000)
                ),
            }
        ]
    )

    ConstructorLineageIngestor(db).ingest()

    rows = db.query(ConstructorLineage).all()
    assert [r.constructor_id for r in rows] == ["stewart"]


# --- endpoint ---------------------------------------------------------------


@pytest.fixture()
def lineage_api_data(db, constructors, load_f1db):
    """Stewart's chain, with a race each for Stewart and Red Bull."""
    load_f1db([{"id": "stewart", "chronology": STEWART_CHAIN}])
    ConstructorLineageIngestor(db).ingest()

    db.add_all([Season(year=1999), Season(year=2010), Status(id=1, description="Finished")])
    db.add_all(
        [
            Race(
                id="r-1999",
                season_year=1999,
                round=1,
                name="European Grand Prix",
                circuit_id="c",
                date=datetime.date(1999, 9, 26),
            ),
            Race(
                id="r-2010",
                season_year=2010,
                round=1,
                name="Abu Dhabi Grand Prix",
                circuit_id="c",
                date=datetime.date(2010, 11, 14),
            ),
        ]
    )
    db.add_all(
        [
            RaceResult(
                id="rr-1",
                race_id="r-1999",
                driver_id="d1",
                constructor_id="stewart",
                position=1,
                points=10,
                status_id=1,
            ),
            RaceResult(
                id="rr-2",
                race_id="r-2010",
                driver_id="d1",
                constructor_id="red-bull",
                position=1,
                points=25,
                status_id=1,
            ),
        ]
    )
    db.add(
        ConstructorStanding(
            id="cs-1", race_id="r-2010", constructor_id="red-bull", points=498, position=1, wins=9
        )
    )
    db.commit()


def test_lineage_endpoint_returns_the_chain(client, lineage_api_data):
    response = client.get("/api/constructors/jaguar/lineage")
    assert response.status_code == 200

    body = response.json()
    assert body["lineageRef"] == "stewart"
    assert [e["constructor"]["ref"] for e in body["entries"]] == [
        "stewart",
        "jaguar",
        "red-bull",
    ]
    # The constructor asked about is marked, so the UI can highlight it.
    assert [e["isCurrent"] for e in body["entries"]] == [False, True, False]


def test_lineage_entries_keep_their_own_records(client, lineage_api_data):
    """Each name's record stays its own — the chain is never summed."""
    entries = {
        e["constructor"]["ref"]: e["stats"]
        for e in client.get("/api/constructors/stewart/lineage").json()["entries"]
    }
    assert entries["stewart"]["wins"] == 1
    assert entries["stewart"]["championships"] == 0
    assert entries["red-bull"]["wins"] == 1
    assert entries["red-bull"]["championships"] == 1
    assert entries["jaguar"]["entries"] == 0


def test_lineage_stats_are_scoped_to_the_slot_years(db, constructors, load_f1db, client):
    """Sauber's two spells must not each claim the whole of Sauber's record."""
    load_f1db([{"id": "sauber", "chronology": SAUBER_CHAIN}])
    ConstructorLineageIngestor(db).ingest()

    db.add_all([Season(year=2001), Season(year=2012), Status(id=1, description="Finished")])
    for race_id, year in (("r-2001", 2001), ("r-2012", 2012)):
        db.add(
            Race(
                id=race_id,
                season_year=year,
                round=1,
                name="Grand Prix",
                circuit_id="c",
                date=datetime.date(year, 5, 1),
            )
        )
    db.add_all(
        [
            RaceResult(
                id="rr-a",
                race_id="r-2001",
                driver_id="d1",
                constructor_id="sauber",
                position=4,
                points=3,
                status_id=1,
            ),
            RaceResult(
                id="rr-b",
                race_id="r-2012",
                driver_id="d1",
                constructor_id="sauber",
                position=2,
                points=18,
                status_id=1,
            ),
        ]
    )
    db.commit()

    entries = client.get("/api/constructors/sauber/lineage").json()["entries"]
    slots = [e for e in entries if e["constructor"]["ref"] == "sauber"]
    assert len(slots) == 2
    first, second = sorted(slots, key=lambda e: e["yearFrom"])
    assert first["stats"]["entries"] == 1
    assert first["stats"]["podiums"] == 0
    assert second["stats"]["entries"] == 1
    assert second["stats"]["podiums"] == 1


def test_constructor_without_a_lineage_returns_an_empty_chain(client, lineage_api_data):
    response = client.get("/api/constructors/williams/lineage")
    assert response.status_code == 200
    assert response.json() == {
        "constructor": response.json()["constructor"],
        "lineageRef": None,
        "entries": [],
    }


def test_lineage_of_an_unknown_constructor_is_404(client, lineage_api_data):
    assert client.get("/api/constructors/nope/lineage").status_code == 404
