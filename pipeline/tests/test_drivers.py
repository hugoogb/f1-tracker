def test_list_drivers_empty(client):
    response = client.get("/api/drivers")
    assert response.status_code == 200
    data = response.json()
    assert data["data"] == []
    assert data["total"] == 0


def test_list_drivers_with_data(client, seed_data):
    response = client.get("/api/drivers")
    assert response.status_code == 200
    data = response.json()
    assert len(data["data"]) == 1
    assert data["data"][0]["ref"] == "max_verstappen"
    assert data["data"][0]["headshotUrl"] == "/headshots/max_verstappen.png"
    assert data["data"][0]["countryCode"] == "NL"
    assert data["total"] == 1


def test_list_drivers_filter_nationality(client, seed_data):
    response = client.get("/api/drivers?nationality=Dutch")
    assert response.status_code == 200
    assert len(response.json()["data"]) == 1

    response = client.get("/api/drivers?nationality=British")
    assert response.status_code == 200
    assert len(response.json()["data"]) == 0


def test_get_driver_not_found(client):
    response = client.get("/api/drivers/nonexistent")
    assert response.status_code == 404


def test_get_driver(client, seed_data):
    response = client.get("/api/drivers/max_verstappen")
    assert response.status_code == 200
    data = response.json()
    assert data["firstName"] == "Max"
    assert data["lastName"] == "Verstappen"
    assert data["code"] == "VER"
    assert data["headshotUrl"] == "/headshots/max_verstappen.png"
    assert data["countryCode"] == "NL"
    assert "stats" in data
