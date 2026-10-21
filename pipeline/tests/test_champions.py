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
