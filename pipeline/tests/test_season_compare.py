"""Within-season comparison of two drivers or two constructors.

The fixture is a three-round season with two teams of two. Round 3 has no
qualifying times and no laps, so every timing figure has to report the two
rounds it covers rather than averaging a zero in. Round 1 carries Fast-F1
positions; round 2 has lap times only, which is the cumulative fallback.

Standings are written for the final round only, as f1db supplies them: the
table as it stood at the end, not after every round.
"""

import datetime

import pytest

from src.db.models import (
    Constructor,
    ConstructorStanding,
    Driver,
    DriverStanding,
    LapTime,
    QualifyingResult,
    Race,
    RaceResult,
    Season,
    SprintResult,
    Status,
)

YEAR = 2024
LAPS = 10

# round -> driver -> (grid, position, positionText, points, laps)
RESULTS = {
    1: {
        "ver": (1, 1, "1", 25, LAPS),
        "per": (3, 3, "3", 15, LAPS),
        "lec": (2, 2, "2", 18, LAPS),
        "sai": (4, None, "DNF", 0, 4),
    },
    2: {
        "ver": (2, 2, "2", 18, LAPS),
        "per": (4, 4, "4", 12, LAPS),
        "lec": (1, 1, "1", 25, LAPS),
        "sai": (3, 3, "3", 15, LAPS),
    },
    3: {
        "ver": (1, 1, "1", 25, LAPS),
        "per": (2, 2, "2", 18, LAPS),
        "lec": (3, 3, "3", 15, LAPS),
        "sai": (4, 4, "4", 12, LAPS),
    },
}
TEAM = {"ver": "red-bull", "per": "red-bull", "lec": "ferrari", "sai": "ferrari"}
# Best Q3 time per driver per round (rounds 1-2 only).
QUALI_MS = {
    1: {"ver": 90_000, "lec": 90_200, "per": 90_500, "sai": 90_700},
    2: {"lec": 89_900, "ver": 90_000, "sai": 90_100, "per": 90_300},
}
# Clean race lap per driver in rounds 1-2.
LAP_MS = {"ver": 95_000, "per": 95_400, "lec": 95_200, "sai": 95_600}


def _fmt(ms: int) -> str:
    return f"{ms // 60_000}:{(ms % 60_000) / 1000:06.3f}"


@pytest.fixture()
def season(db):
    db.add_all(
        [
            Season(year=YEAR),
            Status(id=1, description="Finished"),
            Constructor(id="red-bull", ref="red-bull", name="Red Bull", color="#4781D7"),
            Constructor(id="ferrari", ref="ferrari", name="Ferrari", color="#ED1131"),
            Constructor(id="williams", ref="williams", name="Williams", color="#1868DB"),
        ]
    )
    for ref in TEAM:
        db.add(Driver(id=ref, ref=ref, first_name=ref.title(), last_name=ref.title(), code=ref[:3]))

    cumulative_driver: dict[str, float] = {d: 0 for d in TEAM}
    cumulative_team: dict[str, float] = {"red-bull": 0, "ferrari": 0}
    for rnd, results in RESULTS.items():
        race_id = f"r{rnd}"
        db.add(
            Race(
                id=race_id,
                season_year=YEAR,
                round=rnd,
                name=f"Round {rnd} Grand Prix",
                circuit_id="circuit-1",
                date=datetime.date(YEAR, 3, rnd),
                fastest_lap_driver_id="lec" if rnd == 2 else "ver",
                fastest_lap_constructor_id="ferrari" if rnd == 2 else "red-bull",
            )
        )
        for did, (grid, pos, text, pts, laps) in results.items():
            db.add(
                RaceResult(
                    id=f"{race_id}-{did}",
                    race_id=race_id,
                    driver_id=did,
                    constructor_id=TEAM[did],
                    grid=grid,
                    position=pos,
                    position_text=text,
                    points=pts,
                    laps=laps,
                    status_id=1,
                )
            )
            cumulative_driver[did] += pts
            cumulative_team[TEAM[did]] += pts

        # A sprint in round 2 worth 8 to Verstappen, which only the standings carry.
        if rnd == 2:
            db.add(
                SprintResult(
                    id="s2-ver",
                    race_id=race_id,
                    driver_id="ver",
                    constructor_id="red-bull",
                    position=1,
                    points=8,
                )
            )
            cumulative_driver["ver"] += 8
            cumulative_team["red-bull"] += 8

        if rnd == max(RESULTS):
            for did, total in cumulative_driver.items():
                db.add(
                    DriverStanding(
                        id=f"ds{rnd}-{did}", race_id=race_id, driver_id=did, points=total
                    )
                )
            for cid, total in cumulative_team.items():
                db.add(
                    ConstructorStanding(
                        id=f"cs{rnd}-{cid}", race_id=race_id, constructor_id=cid, points=total
                    )
                )

        quali_times = QUALI_MS.get(rnd)
        order = sorted(results, key=lambda d: results[d][0])
        for qpos, did in enumerate(order, start=1):
            db.add(
                QualifyingResult(
                    id=f"q{rnd}-{did}",
                    race_id=race_id,
                    driver_id=did,
                    constructor_id=TEAM[did],
                    position=qpos,
                    q1=_fmt(quali_times[did] + 1000) if quali_times else None,
                    q3=_fmt(quali_times[did]) if quali_times else None,
                )
            )

        if rnd in (1, 2):
            for did, (_g, pos, _t, _p, laps) in results.items():
                for lap in range(1, laps + 1):
                    # One slow lap per driver (a pit stop) the clean filter must drop.
                    time_ms = LAP_MS[did] + (20_000 if lap == 5 else 0)
                    db.add(
                        LapTime(
                            id=f"{race_id}-{did}-{lap}",
                            race_id=race_id,
                            driver_id=did,
                            lap_number=lap,
                            position=(pos or 4) if rnd == 1 else None,
                            time_millis=time_ms,
                        )
                    )
    db.commit()


def test_constructors_official_points_and_cumulative_delta(client, season):
    res = client.get(f"/api/seasons/{YEAR}/compare/constructors?c1=red-bull&c2=ferrari")
    assert res.status_code == 200
    data = res.json()

    assert data["type"] == "constructors"
    assert data["a"]["ref"] == "red-bull" and data["b"]["color"] == "#ED1131"
    assert data["pointsSource"] == "official"
    assert [r["round"] for r in data["rounds"]] == [1, 2, 3]

    r1, r2, r3 = data["rounds"]
    assert r1["a"]["points"] == 40 and r1["b"]["points"] == 18
    assert r1["cumulativeDelta"] == 22
    # Awarded points per round include the sprint.
    assert r2["a"]["points"] == 38 and r2["b"]["points"] == 40
    assert r2["cumulativeDelta"] == 20
    assert r3["cumulativeDelta"] == 36

    assert r1["a"]["bestFinish"] == 1 and r1["b"]["bestFinish"] == 2
    assert r1["finishDelta"] == -1
    assert r2["gridDelta"] == 1

    agg = data["aggregates"]
    assert agg["points"] == {"a": 121, "b": 85, "delta": 36}
    assert agg["wins"] == {"a": 2, "b": 1, "delta": 1}
    assert agg["podiums"]["a"] == 5 and agg["podiums"]["b"] == 4
    assert agg["dnfs"] == {"a": 0, "b": 1, "delta": -1}
    assert agg["fastestLaps"] == {"a": 2, "b": 1, "delta": 1}
    assert agg["poles"] == {"a": 2, "b": 1, "delta": 1}
    assert agg["pointsFinishes"] == {"a": 6, "b": 5, "delta": 1}

    # Best car each round: Red Bull ahead in 1 and 3, Ferrari in 2.
    assert data["headToHead"]["race"] == {"a": 2, "b": 1, "ties": 0, "total": 3}
    assert data["headToHead"]["qualifying"] == {"a": 2, "b": 1, "ties": 0, "total": 3}


def test_drivers_teammates_and_positions(client, season):
    res = client.get(f"/api/seasons/{YEAR}/compare/drivers?d1=ver&d2=per")
    assert res.status_code == 200
    data = res.json()

    assert data["type"] == "drivers"
    assert data["teammates"]["sameTeam"] is True
    assert data["teammates"]["sharedRounds"] == 3
    assert data["teammates"]["constructor"]["ref"] == "red-bull"
    assert data["a"]["constructor"]["color"] == "#4781D7"

    r1 = data["rounds"][0]
    assert r1["a"]["finish"] == 1 and r1["b"]["finish"] == 3
    assert r1["finishDelta"] == -2 and r1["gridDelta"] == -2
    assert data["headToHead"]["race"]["a"] == 3

    agg = data["aggregates"]
    assert agg["points"] == {"a": 76, "b": 45, "delta": 31}
    assert agg["averageFinish"] == {"a": 1.33, "b": 3.0, "delta": -1.67}
    assert agg["averageGrid"]["a"] == 1.33


def test_rivals_are_not_teammates(client, season):
    data = client.get(f"/api/seasons/{YEAR}/compare/drivers?d1=ver&d2=lec").json()
    assert data["teammates"] == {"sameTeam": False, "sharedRounds": 0, "constructor": None}
    # A DNF behind a classified finisher still counts in the race head-to-head.
    sai = client.get(f"/api/seasons/{YEAR}/compare/drivers?d1=per&d2=sai").json()
    assert sai["headToHead"]["race"]["a"] == 2


def test_qualifying_gap_reports_coverage(client, season):
    data = client.get(f"/api/seasons/{YEAR}/compare/drivers?d1=ver&d2=lec").json()
    r1, r2, r3 = data["rounds"]
    assert r1["qualifyingGap"]["session"] == "Q3"
    assert r1["qualifyingGap"]["deltaMs"] == -200
    assert r2["qualifyingGap"]["deltaMs"] == 100
    assert r3["qualifyingGap"] is None

    gap = data["qualifyingGap"]
    assert gap["roundsCovered"] == 2 and gap["roundsShared"] == 3
    assert gap["averageDeltaMs"] == -50


def test_race_pace_uses_clean_laps(client, season):
    data = client.get(f"/api/seasons/{YEAR}/compare/drivers?d1=ver&d2=lec").json()
    pace = data["rounds"][0]["racePace"]
    # Lap 1 and the 20-second pit lap are both gone.
    assert pace["aCleanLaps"] == LAPS - 2
    assert pace["deltaMs"] == -200
    assert data["rounds"][2]["racePace"] is None
    assert data["racePace"]["roundsCovered"] == 2


def test_laps_led_from_positions_and_cumulative_fallback(client, season):
    data = client.get(f"/api/seasons/{YEAR}/compare/drivers?d1=ver&d2=lec").json()
    r1, r2, r3 = data["rounds"]
    # Round 1: Fast-F1 positions put Verstappen first on every lap.
    assert r1["a"]["lapsLed"] == LAPS and r1["b"]["lapsLed"] == 0
    # Round 2 has no positions: lowest elapsed time leads, which is Verstappen
    # on the quickest laps throughout.
    assert r2["a"]["lapsLed"] == LAPS
    assert r2["lapsLedCoverage"] == {"coveredLaps": LAPS, "totalLaps": LAPS}
    # Round 3 has no lap data at all: unknown, not zero.
    assert r3["a"]["lapsLed"] is None and r3["lapsLedCoverage"] is None
    assert data["aggregates"]["lapsLed"]["a"] == 2 * LAPS
    assert data["lapsLedCoverage"] == {"roundsCovered": 2, "roundsRaced": 3}


def test_absent_entity_is_404(client, season):
    res = client.get(f"/api/seasons/{YEAR}/compare/constructors?c1=red-bull&c2=williams")
    assert res.status_code == 404
    assert client.get(f"/api/seasons/{YEAR}/compare/drivers?d1=ver&d2=nobody").status_code == 404
    assert client.get("/api/seasons/1999/compare/drivers?d1=ver&d2=per").status_code == 404


def test_same_entity_is_rejected(client, season):
    res = client.get(f"/api/seasons/{YEAR}/compare/drivers?d1=ver&d2=ver")
    assert res.status_code == 400


def test_entrants_follow_the_standings(client, season, db):
    # Give the final round positions so the order has something to follow.
    for did, pos in (("ver", 1), ("lec", 2), ("per", 3), ("sai", 4)):
        db.get(DriverStanding, f"ds3-{did}").position = pos
    db.get(ConstructorStanding, "cs3-red-bull").position = 1
    db.get(ConstructorStanding, "cs3-ferrari").position = 2
    db.commit()

    data = client.get(f"/api/seasons/{YEAR}/compare/entrants").json()
    assert [d["ref"] for d in data["drivers"]] == ["ver", "lec", "per", "sai"]
    assert data["drivers"][1]["constructor"]["ref"] == "ferrari"
    # Williams is a constructor on file but never raced this season.
    assert [c["ref"] for c in data["constructors"]] == ["red-bull", "ferrari"]


def test_dropped_result_counts_as_awarded_but_not_in_the_total(client, season, db):
    """A best-N season: a result that scored on the day but did not count.

    The round still shows what was awarded; the championship total is the
    official one, and the difference is reported rather than hidden.
    """
    db.get(DriverStanding, "ds3-per").points = 27  # 18 scored in round 3, none counted
    db.commit()
    data = client.get(f"/api/seasons/{YEAR}/compare/drivers?d1=ver&d2=per").json()
    assert data["rounds"][2]["b"]["points"] == 18
    assert data["rounds"][2]["b"]["cumulativePoints"] == 45
    assert data["aggregates"]["points"] == {"a": 76, "b": 27, "delta": 49}
    assert data["points"]["scored"]["b"] == 45
    assert data["points"]["dropped"] == {"a": 0, "b": 18, "delta": -18}


def test_season_without_constructor_standings_sums_results(client, season, db):
    """No official table to read: totals come from results, flagged."""
    db.query(ConstructorStanding).delete()
    db.commit()
    data = client.get(f"/api/seasons/{YEAR}/compare/constructors?c1=red-bull&c2=ferrari").json()
    assert data["pointsSource"] == "results"
    assert data["aggregates"]["points"]["a"] == 121
    assert data["points"]["dropped"] is None


def test_constructor_tables_before_1958_are_not_official(client, db):
    """The ingest computes constructor standings for every season, but there was
    no constructors' championship to be official about before 1958."""
    db.add_all(
        [
            Season(year=1955),
            Constructor(id="mercedes", ref="mercedes", name="Mercedes", color="#00D7B6"),
            Constructor(id="ferrari", ref="ferrari", name="Ferrari", color="#ED1131"),
            Driver(id="fangio", ref="fangio", first_name="Juan", last_name="Fangio"),
            Driver(id="castellotti", ref="castellotti", first_name="E", last_name="Castellotti"),
            Race(id="r55", season_year=1955, round=1, name="Argentine GP", circuit_id="c1"),
        ]
    )
    for did, cid, pos, pts in (("fangio", "mercedes", 1, 8), ("castellotti", "ferrari", 2, 6)):
        db.add(
            RaceResult(
                id=f"r55-{did}",
                race_id="r55",
                driver_id=did,
                constructor_id=cid,
                grid=pos,
                position=pos,
                position_text=str(pos),
                points=pts,
                laps=96,
            )
        )
        db.add(ConstructorStanding(id=f"cs55-{cid}", race_id="r55", constructor_id=cid, points=99))
    db.commit()

    data = client.get("/api/seasons/1955/compare/constructors?c1=mercedes&c2=ferrari").json()
    assert data["pointsSource"] == "results"
    assert data["aggregates"]["points"] == {"a": 8, "b": 6, "delta": 2}
    assert data["points"]["dropped"] is None
