def test_search_empty_query(client):
    response = client.get("/api/search?q=")
    assert response.status_code == 200
    data = response.json()
    assert data["drivers"] == []
    assert data["constructors"] == []
    assert data["circuits"] == []


def test_search_short_query(client, seed_data):
    response = client.get("/api/search?q=a")
    assert response.status_code == 200
    data = response.json()
    assert data["drivers"] == []


def test_search_drivers(client, seed_data):
    response = client.get("/api/search?q=verstappen")
    assert response.status_code == 200
    data = response.json()
    assert len(data["drivers"]) == 1
    assert data["drivers"][0]["ref"] == "max_verstappen"
    assert data["drivers"][0]["lastName"] == "Verstappen"


def test_search_constructors(client, seed_data):
    response = client.get("/api/search?q=red bull")
    assert response.status_code == 200
    data = response.json()
    assert len(data["constructors"]) == 1
    assert data["constructors"][0]["ref"] == "red_bull"


def test_search_no_results(client, seed_data):
    response = client.get("/api/search?q=zzzzzzz")
    assert response.status_code == 200
    data = response.json()
    assert data["drivers"] == []
    assert data["constructors"] == []
    assert data["circuits"] == []
