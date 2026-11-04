def test_champions_empty(client, seed_data):
    response = client.get("/api/champions")
    assert response.status_code == 200
    data = response.json()
    assert data["data"] == []


def test_champions_with_data(client, race_seed_data):
    response = client.get("/api/champions")
    assert response.status_code == 200
    data = response.json()
    assert len(data["data"]) == 1
    assert data["data"][0]["year"] == 2023
    assert data["data"][0]["driver"]["ref"] == "max_verstappen"
    assert data["data"][0]["driverPoints"] == 25.0
    assert data["data"][0]["constructor"]["ref"] == "red_bull"


def test_champions_carry_the_drivers_own_team(client, race_seed_data):
    data = client.get("/api/champions").json()["data"][0]
    assert data["driverConstructor"]["ref"] == "red_bull"
    assert data["driverConstructor"]["color"] == "#3671C6"


def test_driver_team_differs_from_constructors_champion(client, race_seed_data, db):
    # The drivers' champion's team need not be the constructors' champion
    # (2024: Verstappen drove for Red Bull, McLaren won the constructors').
    from src.db.models import ConstructorStanding

    cs = db.get(ConstructorStanding, "cs-1")
    cs.constructor_id = "constructor-2"
    db.commit()

    data = client.get("/api/champions").json()["data"][0]
    assert data["constructor"]["ref"] == "ferrari"
    assert data["driverConstructor"]["ref"] == "red_bull"


def test_no_constructors_champion_before_the_championship_existed(client, db):
    """1958 was the first constructors' title; an earlier table only sums points."""
    from datetime import date

    from src.db.models import (
        Circuit,
        Constructor,
        ConstructorStanding,
        Driver,
        DriverStanding,
        Race,
        Season,
    )

    db.add(Circuit(id="monza", ref="monza", name="Monza"))
    db.add(Constructor(id="ferrari", ref="ferrari", name="Ferrari"))
    db.add(Driver(id="d", ref="d", first_name="A", last_name="B"))
    for year in (1957, 1958):
        rid = f"{year}_01"
        db.add(Season(year=year))
        db.add(
            Race(
                id=rid,
                season_year=year,
                round=1,
                name="GP",
                circuit_id="monza",
                date=date(year, 9, 1),
            )
        )
        db.add(
            DriverStanding(id=f"{rid}_D", race_id=rid, driver_id="d", points=9, position=1, wins=1)
        )
        db.add(
            ConstructorStanding(
                id=f"{rid}_C", race_id=rid, constructor_id="ferrari", points=9, position=1, wins=1
            )
        )
    db.commit()

    by_year = {row["year"]: row for row in client.get("/api/champions").json()["data"]}
    assert by_year[1957]["constructor"] is None
    assert by_year[1958]["constructor"]["ref"] == "ferrari"

    explore = client.get("/api/records/explore?entity=constructor&category=championships").json()
    assert [row["value"] for row in explore["data"]] == [1]
    assert client.get("/api/records").json()["constructors"]["mostChampionships"][0]["count"] == 1
