def test_records_empty(client):
    response = client.get("/api/records")
    assert response.status_code == 200
    data = response.json()
    assert data["drivers"]["mostWins"] == []
    assert data["constructors"]["mostWins"] == []


def test_records_with_data(client, race_seed_data):
    response = client.get("/api/records")
    assert response.status_code == 200
    data = response.json()

    # driver-1 has 1 win, 1 podium, 1 start
    assert len(data["drivers"]["mostWins"]) >= 1
    assert data["drivers"]["mostWins"][0]["driver"]["ref"] == "max_verstappen"
    assert data["drivers"]["mostWins"][0]["count"] == 1

    assert len(data["drivers"]["mostPodiums"]) >= 1
    assert len(data["drivers"]["mostStarts"]) >= 1

    # constructor-1 has 1 win
    assert len(data["constructors"]["mostWins"]) >= 1
    assert data["constructors"]["mostWins"][0]["constructor"]["ref"] == "red_bull"


def test_records_limit_param(client, race_seed_data):
    response = client.get("/api/records?limit=1")
    assert response.status_code == 200
    data = response.json()
    assert len(data["drivers"]["mostWins"]) <= 1
    assert len(data["drivers"]["mostStarts"]) <= 1
