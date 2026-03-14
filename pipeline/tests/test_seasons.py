def test_list_seasons_empty(client):
    response = client.get("/api/seasons")
    assert response.status_code == 200
    assert response.json() == {"data": []}


def test_list_seasons_with_data(client, seed_data):
    response = client.get("/api/seasons")
    assert response.status_code == 200
    data = response.json()["data"]
    assert len(data) == 1
    assert data[0]["year"] == 2023


def test_get_season(client, seed_data):
    response = client.get("/api/seasons/2023")
    assert response.status_code == 200
    data = response.json()
    assert data["year"] == 2023
    assert data["races"] == []
