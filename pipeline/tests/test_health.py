def test_health_check(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_stats_empty(client):
    response = client.get("/api/stats")
    assert response.status_code == 200
    data = response.json()
    assert data["seasons"] == 0
    assert data["drivers"] == 0
    assert data["constructors"] == 0
    assert data["races"] == 0
    assert data["circuits"] == 0


def test_stats_with_data(client, seed_data):
    response = client.get("/api/stats")
    assert response.status_code == 200
    data = response.json()
    assert data["seasons"] == 1
    assert data["drivers"] == 1
    assert data["constructors"] == 1
    assert data["circuits"] == 1
