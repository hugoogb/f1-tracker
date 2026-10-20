"""The official championship table after every round, and what reads it.

Under the pre-1991 "best N results" rules a driver's counted total is not the
sum of their results so far, so the running championship can only come from
f1db's own table after each round. These tests build a season where that table
and the summed points disagree about who leads, and check that the ingest
stores it and that progression, best seasons and the in-season comparison all
follow it rather than the sum.
"""

import datetime
from unittest.mock import patch

from src.db.models import (
    Circuit,
    Constructor,
    Driver,
    DriverStanding,
    Race,
    RaceResult,
    Season,
)
from src.db.queries import official_running_totals
from src.ingestion.f1db import F1DBData
from src.ingestion.standings import StandingsIngestor
from tests.test_best_seasons import base, build  # noqa: F401 — `base` is a fixture

# 1988 scoring (9-6-4-3-2-1). Summed, Alpha leads or shares the lead throughout:
# a 9 / 15 / 24, b 6 / 15 / 21.
SCORED = [{"a": 9, "b": 6}, {"b": 9, "a": 6}, {"a": 9, "b": 6}]
# Counted, Alpha's second-round points do not all count, so Bravo leads after
# round 2 and Alpha takes it back at the finale: two lead changes, not none.
OFFICIAL = {
    1: {"a": (9, 1), "b": (6, 2)},
    2: {"b": (15, 1), "a": (13, 2)},
    3: {"a": (22, 1), "b": (21, 2)},
}


def official_tables(db, year, tables, *, skip=()):
    """Store the official table after every round but the last (which `build` owns)."""
    last = max(tables)
    for rnd, table in tables.items():
        if rnd == last or rnd in skip:
            continue
        for did, (pts, pos) in table.items():
            db.add(
                DriverStanding(
                    id=f"{year}-{rnd}_DS_{did}",
                    race_id=f"{year}-{rnd}",
                    driver_id=did,
                    points=pts,
                    position=pos,
                    wins=0,
                )
            )
    db.commit()


def season_1988(db, *, decider=None, skip=()):
    build(db, 1988, SCORED, final={d: p for d, (p, _) in OFFICIAL[3].items()})
    official_tables(db, 1988, OFFICIAL, skip=skip)
    if decider:
        db.get(Race, f"1988-{decider}").drivers_title_decider = True
        db.commit()


def races_of(db, year):
    return db.query(Race).filter(Race.season_year == year).order_by(Race.round).all()


# --- the helper ----------------------------------------------------------------


def test_running_totals_follow_the_official_table(db, base):  # noqa: F811
    season_1988(db)
    totals = official_running_totals(db, races_of(db, 1988))
    assert [totals[f"1988-{r}"]["a"] for r in (1, 2, 3)] == [9, 13, 22]
    assert [totals[f"1988-{r}"]["b"] for r in (1, 2, 3)] == [6, 15, 21]


def test_an_entity_carries_its_last_total_until_it_reappears(db, base):  # noqa: F811
    # f1db lists a driver only once they have scored: Charlie is absent, then 4.
    build(db, 1988, [{"a": 9}, {"a": 9, "c": 4}], final={"a": 18, "c": 4})
    official_tables(db, 1988, {1: {"a": (9, 1)}, 2: {"a": (18, 1), "c": (4, 2)}})
    totals = official_running_totals(db, races_of(db, 1988))
    assert "c" not in totals["1988-1"]
    assert totals["1988-2"]["c"] == 4


def test_a_round_without_a_table_means_no_official_line(db, base):  # noqa: F811
    season_1988(db, skip=(2,))
    assert official_running_totals(db, races_of(db, 1988)) is None


# --- progression ---------------------------------------------------------------


def test_progression_draws_the_official_table(client, db, base):  # noqa: F811
    season_1988(db)
    body = client.get("/api/seasons/1988/standings/progression").json()
    assert body["pointsSource"] == "official"
    assert [r["alpha"] for r in body["rounds"]] == [9, 13, 22]
    assert [r["bravo"] for r in body["rounds"]] == [6, 15, 21]


def test_progression_falls_back_to_summed_points(client, db, base):  # noqa: F811
    season_1988(db, skip=(2,))
    body = client.get("/api/seasons/1988/standings/progression").json()
    assert body["pointsSource"] == "scored"
    assert [r["alpha"] for r in body["rounds"]] == [9, 15, 24]


# --- best seasons --------------------------------------------------------------


def test_lead_changes_follow_the_official_table(client, db, base):  # noqa: F811
    season_1988(db, decider=3)
    season = client.get("/api/best-seasons/1988").json()["season"]
    assert season["leadChanges"] == 2
    assert season["distinctLeaders"] == 2
    assert season["progressionApproximate"] is False


def test_decided_round_is_the_flagged_decider(client, db, base):  # noqa: F811
    season_1988(db, decider=2)
    season = client.get("/api/best-seasons/1988").json()["season"]
    assert season["decidedAtRound"] == 2
    assert season["wentToFinalRound"] is False
    # The visible totals (15 v 13, 9 points left) leave Alpha in it, but the
    # record says it was settled, so nobody could still win it at the finale.
    assert season["contendersAtFinale"] == 1


def test_finale_contenders_on_the_official_table(client, db, base):  # noqa: F811
    season_1988(db, decider=3)
    season = client.get("/api/best-seasons/1988").json()["season"]
    assert season["decidedAtRound"] == 3
    assert season["contendersAtFinale"] == 2


def test_without_tables_the_summed_walk_is_flagged(client, db, base):  # noqa: F811
    season_1988(db, skip=(2,))
    season = client.get("/api/best-seasons/1988").json()["season"]
    assert season["progressionApproximate"] is True
    # Summed, Alpha never loses the lead (a tie does not take it away).
    assert season["leadChanges"] == 0


# --- in-season comparison ------------------------------------------------------


def test_compare_line_is_the_official_table(client, db, base):  # noqa: F811
    season_1988(db)
    body = client.get("/api/seasons/1988/compare/drivers?d1=alpha&d2=bravo").json()
    assert body["cumulativeSource"] == "official"
    assert [r["a"]["cumulativePoints"] for r in body["rounds"]] == [9, 13, 22]
    assert [r["cumulativeDelta"] for r in body["rounds"]] == [3, -2, 1]
    # What was awarded still reports alongside, and the gap is what was dropped.
    assert body["points"]["scored"]["a"] == 24
    assert body["points"]["dropped"]["a"] == 2


# --- the ingest ----------------------------------------------------------------


def _f1db_race(year, rnd, drivers=(), constructors=()):
    return {
        "year": year,
        "round": rnd,
        "driverStandings": [
            {"driverId": d, "positionNumber": pos, "points": pts} for d, pts, pos in drivers
        ],
        "constructorStandings": [
            {"constructorId": c, "positionNumber": pos, "points": pts}
            for c, pts, pos in constructors
        ],
    }


def test_ingest_stores_the_table_after_every_round(db):
    db.add_all(
        [
            Season(year=1988),
            Circuit(id="imola", ref="imola", name="Imola"),
            Constructor(id="mclaren", ref="mclaren", name="McLaren"),
            Driver(id="senna", ref="senna", first_name="Ayrton", last_name="Senna"),
            Driver(id="prost", ref="prost", first_name="Alain", last_name="Prost"),
        ]
    )
    for rnd, winner in ((1, "prost"), (2, "senna"), (3, "senna")):
        rid = f"1988_{rnd:02d}"
        db.add(
            Race(
                id=rid,
                season_year=1988,
                round=rnd,
                name=f"R{rnd}",
                circuit_id="imola",
                date=datetime.date(1988, 4, rnd),
            )
        )
        for did in ("senna", "prost"):
            db.add(
                RaceResult(
                    id=f"{rid}_{did}",
                    race_id=rid,
                    driver_id=did,
                    constructor_id="mclaren",
                    position=1 if did == winner else 2,
                    points=9.0 if did == winner else 6.0,
                )
            )
    db.commit()

    races = [
        _f1db_race(1988, 1, [("prost", 9, 1), ("senna", 6, 2), ("ghost", 1, 3)]),
        _f1db_race(1988, 2, [("senna", 15, 1), ("prost", 15, 2)], [("mclaren", 30, 1)]),
        _f1db_race(1988, 3, [("senna", 24, 1), ("prost", 19, 2)]),
    ]
    seasons = [
        {
            "year": 1988,
            "driverStandings": [
                {"driverId": "senna", "positionNumber": 1, "points": 24},
                {"driverId": "prost", "positionNumber": 2, "points": 19},
            ],
            "constructorStandings": [],
        }
    ]
    data = F1DBData({"countries": [], "grandsPrix": [], "races": races, "seasons": seasons})
    with patch("src.ingestion.standings.f1db.load", return_value=data):
        StandingsIngestor(db).ingest()
        # Idempotent: a second run rewrites the same rows.
        StandingsIngestor(db).ingest()

    def table(race_id):
        rows = db.query(DriverStanding).filter(DriverStanding.race_id == race_id).all()
        return {r.driver_id: (r.points, r.position, r.wins) for r in rows}

    assert table("1988_01") == {"prost": (9, 1, 1), "senna": (6, 2, 0)}  # no unknown driver
    assert table("1988_02") == {"senna": (15, 1, 1), "prost": (15, 2, 1)}
    # The final round keeps its own path: official points, wins over the season.
    assert table("1988_03") == {"senna": (24, 1, 2), "prost": (19, 2, 1)}
    assert db.query(DriverStanding).count() == 6
