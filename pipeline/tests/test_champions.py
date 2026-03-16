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
