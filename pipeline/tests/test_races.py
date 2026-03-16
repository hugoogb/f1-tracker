def test_get_race_not_found(client, seed_data):
    response = client.get("/api/seasons/2023/races/99")
    assert response.status_code == 404


def test_get_race(client, race_seed_data):
    response = client.get("/api/seasons/2023/races/1")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Bahrain Grand Prix"
    assert data["round"] == 1
    assert data["circuit"]["ref"] == "monza"
    assert len(data["results"]) == 2
    assert data["results"][0]["position"] == 1
    assert data["results"][0]["driver"]["ref"] == "max_verstappen"
    assert data["fastestLap"] is not None
    assert data["fastestLap"]["time"] == "1:33.996"


def test_get_qualifying(client, race_seed_data):
    response = client.get("/api/seasons/2023/races/1/qualifying")
    assert response.status_code == 200
    data = response.json()
    assert len(data["results"]) == 2
    assert data["results"][0]["position"] == 1
    assert data["results"][0]["q3"] == "1:29.708"


def test_get_pitstops(client, race_seed_data):
    response = client.get("/api/seasons/2023/races/1/pitstops")
    assert response.status_code == 200
    data = response.json()
    assert len(data["pitStops"]) == 1
    assert data["pitStops"][0]["lap"] == 20
    assert data["pitStops"][0]["driver"]["ref"] == "max_verstappen"
