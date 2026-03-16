def test_compare_drivers_not_found(client, seed_data):
    response = client.get("/api/compare/drivers?d1=max_verstappen&d2=nonexistent")
    assert response.status_code == 404


def test_compare_drivers(client, race_seed_data):
    response = client.get("/api/compare/drivers?d1=max_verstappen&d2=perez")
    assert response.status_code == 200
    data = response.json()
    assert data["driver1"]["ref"] == "max_verstappen"
    assert data["driver2"]["ref"] == "perez"
    assert data["headToHead"]["totalRaces"] == 1
    assert data["headToHead"]["driver1Wins"] == 1
    assert data["headToHead"]["driver2Wins"] == 0
    assert data["qualifyingHeadToHead"]["totalRaces"] == 1
    assert "driver1Radar" in data
    assert "driver1Seasons" in data
    # Teammate seasons (both drove for constructor-1)
    assert 2023 in data["teammateSeasons"]


def test_compare_constructors(client, race_seed_data):
    response = client.get("/api/compare/constructors?c1=red_bull&c2=ferrari")
    assert response.status_code == 200
    data = response.json()
    assert data["constructor1"]["ref"] == "red_bull"
    assert data["constructor2"]["ref"] == "ferrari"
    assert "headToHead" in data
    assert "constructor1Seasons" in data
