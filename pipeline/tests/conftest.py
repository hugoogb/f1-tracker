import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.api.main import app
from src.db.database import Base, get_db
from src.db.models import Circuit, CircuitLayout, Constructor, Driver, Season

engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSession = sessionmaker(bind=engine)


@pytest.fixture(autouse=True)
def setup_database():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def db():
    session = TestSession()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client(db):
    def override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture()
def seed_data(db):
    season = Season(year=2023, url="https://example.com")
    driver = Driver(
        id="driver-1",
        ref="max_verstappen",
        first_name="Max",
        last_name="Verstappen",
        code="VER",
        number=1,
        nationality="Dutch",
    )
    constructor = Constructor(
        id="constructor-1",
        ref="red_bull",
        name="Red Bull",
        nationality="Austrian",
        color="#3671C6",
    )
    circuit = Circuit(
        id="circuit-1",
        ref="monza",
        name="Autodromo Nazionale di Monza",
        location="Monza",
        country="Italy",
        latitude=45.6156,
        longitude=9.2811,
    )
    layout1 = CircuitLayout(
        id="layout-1",
        circuit_id="circuit-1",
        layout_number=6,
        svg_id="monza-6",
        seasons_active="1976-1979,1981-1999",
    )
    layout2 = CircuitLayout(
        id="layout-2",
        circuit_id="circuit-1",
        layout_number=7,
        svg_id="monza-7",
        seasons_active="2000-2026",
    )
    db.add_all([season, driver, constructor, circuit, layout1, layout2])
    db.commit()
    return {"season": season, "driver": driver, "constructor": constructor, "circuit": circuit}
