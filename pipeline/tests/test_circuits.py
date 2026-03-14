def test_list_circuits_empty(client):
    response = client.get("/api/circuits")
    assert response.status_code == 200
    assert response.json()["data"] == []
    assert response.json()["total"] == 0


def test_list_circuits_with_data(client, seed_data):
    response = client.get("/api/circuits")
    assert response.status_code == 200
    data = response.json()["data"]
    assert len(data) == 1
    assert data[0]["ref"] == "monza"


def test_list_circuits_no_layouts(client, seed_data):
    """Layout data should NOT be in the list endpoint."""
    response = client.get("/api/circuits")
    assert response.status_code == 200
    data = response.json()["data"]
    assert "layouts" not in data[0]


def test_list_circuits_filter_country(client, seed_data):
    response = client.get("/api/circuits?country=Italy")
    assert response.status_code == 200
    assert len(response.json()["data"]) == 1

    response = client.get("/api/circuits?country=UK")
    assert response.status_code == 200
    assert len(response.json()["data"]) == 0


def test_get_circuit_not_found(client):
    response = client.get("/api/circuits/nonexistent")
    assert response.status_code == 404


def test_get_circuit(client, seed_data):
    response = client.get("/api/circuits/monza")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Autodromo Nazionale di Monza"
    assert data["country"] == "Italy"


def test_get_circuit_with_layouts(client, seed_data):
    response = client.get("/api/circuits/monza")
    assert response.status_code == 200
    data = response.json()
    assert "layouts" in data
    assert len(data["layouts"]) == 2
    assert data["layouts"][0]["layoutNumber"] == 6
    assert data["layouts"][0]["svgId"] == "monza-6"
    assert data["layouts"][0]["seasonsActive"] == "1976-1979,1981-1999"
    assert data["layouts"][1]["layoutNumber"] == 7
    assert data["layouts"][1]["svgId"] == "monza-7"
    assert data["layouts"][1]["seasonsActive"] == "2000-2026"
