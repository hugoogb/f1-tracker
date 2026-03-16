def test_list_constructors_empty(client):
    response = client.get("/api/constructors")
    assert response.status_code == 200
    data = response.json()
    assert data["data"] == []
    assert data["total"] == 0


def test_list_constructors_with_data(client, seed_data):
    response = client.get("/api/constructors")
    assert response.status_code == 200
    data = response.json()
    assert len(data["data"]) == 1
    assert data["data"][0]["ref"] == "red_bull"
    assert data["data"][0]["name"] == "Red Bull"
    assert data["data"][0]["color"] == "#3671C6"
    assert data["total"] == 1


def test_list_constructors_filter_nationality(client, seed_data):
    response = client.get("/api/constructors?nationality=Austrian")
    assert response.status_code == 200
    assert len(response.json()["data"]) == 1

    response = client.get("/api/constructors?nationality=British")
    assert response.status_code == 200
    assert len(response.json()["data"]) == 0


def test_get_constructor_not_found(client):
    response = client.get("/api/constructors/nonexistent")
    assert response.status_code == 404


def test_get_constructor(client, race_seed_data):
    response = client.get("/api/constructors/red_bull")
    assert response.status_code == 200
    data = response.json()
    assert data["ref"] == "red_bull"
    assert data["name"] == "Red Bull"
    assert "stats" in data
    assert data["stats"]["wins"] == 1
    assert data["stats"]["podiums"] == 2
