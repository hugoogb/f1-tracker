def test_health_check(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_health_db(client):
    response = client.get("/api/health/db")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}


def test_health_db_unreachable_hides_the_error(client):
    """The endpoint is public: a driver error names the host and user."""
    from sqlalchemy.exc import OperationalError

    from src.api.main import app
    from src.db.database import get_db

    class Broken:
        def execute(self, *_):
            raise OperationalError("SELECT 1", {}, Exception("host=db.internal user=f1"))

    app.dependency_overrides[get_db] = lambda: Broken()
    response = client.get("/api/health/db")
    assert response.status_code == 503
    assert response.json() == {"status": "error", "database": "unreachable"}
    assert "db.internal" not in response.text


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
