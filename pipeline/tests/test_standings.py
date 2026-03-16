def test_driver_standings(client, race_seed_data):
    response = client.get("/api/seasons/2023/standings/drivers")
    assert response.status_code == 200
    data = response.json()
    assert data["year"] == 2023
    assert len(data["standings"]) == 2
    assert data["standings"][0]["position"] == 1
    assert data["standings"][0]["points"] == 25.0
    assert data["standings"][0]["driver"]["ref"] == "max_verstappen"


def test_constructor_standings(client, race_seed_data):
    response = client.get("/api/seasons/2023/standings/constructors")
    assert response.status_code == 200
    data = response.json()
    assert data["year"] == 2023
    assert len(data["standings"]) == 1
    assert data["standings"][0]["position"] == 1
    assert data["standings"][0]["constructor"]["ref"] == "red_bull"


def test_driver_standings_no_data(client, seed_data):
    response = client.get("/api/seasons/2023/standings/drivers")
    assert response.status_code == 200
    data = response.json()
    assert data["standings"] == []


def test_standings_progression(client, race_seed_data):
    response = client.get("/api/seasons/2023/standings/progression")
    assert response.status_code == 200
    data = response.json()
    assert data["year"] == 2023
    assert len(data["rounds"]) == 1
    assert len(data["drivers"]) >= 1
