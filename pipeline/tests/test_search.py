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


def test_search_empty_query_has_season_and_race_keys(client):
    data = client.get("/api/search?q=").json()
    assert data["seasons"] == []
    assert data["races"] == []


def test_search_year_returns_season(client, race_seed_data):
    data = client.get("/api/search?q=2023").json()
    assert data["seasons"] == [{"year": 2023}]
    assert data["races"] == [
        {
            "year": 2023,
            "round": 1,
            "name": "Bahrain Grand Prix",
            "circuitName": "Autodromo Nazionale di Monza",
            "date": "2023-03-05",
        }
    ]


def test_search_unknown_year(client, race_seed_data):
    response = client.get("/api/search?q=1949")
    assert response.status_code == 200
    data = response.json()
    assert data["seasons"] == []
    assert data["races"] == []


def test_search_race_by_name(client, race_seed_data):
    data = client.get("/api/search?q=bahrain").json()
    assert [(r["year"], r["round"]) for r in data["races"]] == [(2023, 1)]


def test_search_race_by_circuit_and_year(client, race_seed_data):
    data = client.get("/api/search?q=monza 2023").json()
    assert [(r["year"], r["round"]) for r in data["races"]] == [(2023, 1)]
    assert data["seasons"] == [{"year": 2023}]

    data = client.get("/api/search?q=monza 2099").json()
    assert data["races"] == []


def test_search_wildcards_are_literal(client, race_seed_data):
    for q in ("%%", "__"):
        data = client.get("/api/search", params={"q": q}).json()
        assert data == {
            "drivers": [],
            "constructors": [],
            "circuits": [],
            "seasons": [],
            "races": [],
        }, q


def test_search_race_without_year_matches_race_names_only(client, race_seed_data):
    # The seed race is the Bahrain GP held at Monza: a circuit substring alone
    # ("ham" in Francorchamps, "monza" here) must not flood the race results.
    data = client.get("/api/search?q=monza").json()
    assert data["races"] == []
    assert [c["ref"] for c in data["circuits"]] == ["monza"]
