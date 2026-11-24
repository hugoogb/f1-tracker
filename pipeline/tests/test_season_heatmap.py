import datetime

from src.db.models import DriverStanding, Race, RaceResult


def test_heatmap_404_for_unknown_season(client):
    assert client.get("/api/seasons/1900/heatmap").status_code == 404


def test_heatmap_orders_by_latest_table_and_uses_last_team(client, db, race_seed_data):
    """A running season: round 2 has results but no standings table yet.

    The order must come from round 1's table (Perez leads it here), not from
    the calendar's last round, and a driver's team is the one of their latest
    round.
    """
    db.query(DriverStanding).filter_by(id="ds-1").update({"position": 2})
    db.query(DriverStanding).filter_by(id="ds-2").update({"position": 1})
    db.add(
        Race(
            id="race-2",
            season_year=2023,
            round=2,
            name="Saudi Arabian Grand Prix",
            circuit_id="circuit-1",
            date=datetime.date(2023, 3, 19),
        )
    )
    db.add(
        RaceResult(
            id="result-3",
            race_id="race-2",
            driver_id="driver-2",
            constructor_id="constructor-2",
            position=1,
            position_text="1",
            points=25.0,
            status_id=1,
        )
    )
    db.commit()

    data = client.get("/api/seasons/2023/heatmap").json()
    assert [r["round"] for r in data["rounds"]] == [1, 2]
    assert [d["driver"]["ref"] for d in data["drivers"]] == ["perez", "max_verstappen"]
    perez = data["drivers"][0]
    assert perez["constructor"]["ref"] == "ferrari"
    assert [r["round"] for r in perez["results"]] == [1, 2]
