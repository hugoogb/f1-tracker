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
