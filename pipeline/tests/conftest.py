import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.api.main import app
from src.db.database import Base, get_db
from src.db.models import (
    Circuit,
    CircuitLayout,
    Constructor,
    ConstructorStanding,
    Driver,
    DriverStanding,
    PitStop,
    QualifyingResult,
    Race,
    RaceResult,
    Season,
    Status,
)

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
        country_code="NL",
        has_headshot=True,
    )
    constructor = Constructor(
        id="constructor-1",
        ref="red_bull",
        name="Red Bull",
        nationality="Austrian",
        country_code="AT",
        color="#3671C6",
    )
    circuit = Circuit(
        id="circuit-1",
        ref="monza",
        name="Autodromo Nazionale di Monza",
        location="Monza",
        country="Italy",
        country_code="IT",
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


@pytest.fixture()
def race_seed_data(seed_data, db):
    """Extended seed data with race results, standings, qualifying, and pit stops."""
    driver2 = Driver(
        id="driver-2",
        ref="perez",
        first_name="Sergio",
        last_name="Perez",
        code="PER",
        number=11,
        nationality="Mexican",
        country_code="MX",
        has_headshot=False,
    )
    constructor2 = Constructor(
        id="constructor-2",
        ref="ferrari",
        name="Ferrari",
        nationality="Italian",
        country_code="IT",
        color="#E8002D",
    )
    status = Status(id=1, description="Finished")
    race = Race(
        id="race-1",
        season_year=2023,
        round=1,
        name="Bahrain Grand Prix",
        circuit_id="circuit-1",
        date=datetime.date(2023, 3, 5),
        fastest_lap_driver_id="driver-1",
        fastest_lap_constructor_id="constructor-1",
        fastest_lap_number=44,
        fastest_lap_time="1:33.996",
        fastest_lap_speed="210.5",
    )
    result1 = RaceResult(
        id="result-1",
        race_id="race-1",
        driver_id="driver-1",
        constructor_id="constructor-1",
        number=1,
        grid=1,
        position=1,
        position_text="1",
        points=25.0,
        laps=57,
        time_text="1:33:56.736",
        status_id=1,
    )
    result2 = RaceResult(
        id="result-2",
        race_id="race-1",
        driver_id="driver-2",
        constructor_id="constructor-1",
        number=11,
        grid=2,
        position=2,
        position_text="2",
        points=18.0,
        laps=57,
        time_text="+11.987",
        status_id=1,
    )
    quali1 = QualifyingResult(
        id="quali-1",
        race_id="race-1",
        driver_id="driver-1",
        constructor_id="constructor-1",
        number=1,
        position=1,
        q1="1:31.000",
        q2="1:30.500",
        q3="1:29.708",
    )
    quali2 = QualifyingResult(
        id="quali-2",
        race_id="race-1",
        driver_id="driver-2",
        constructor_id="constructor-1",
        number=11,
        position=2,
        q1="1:31.200",
        q2="1:30.800",
        q3="1:30.034",
    )
    ds1 = DriverStanding(
        id="ds-1",
        race_id="race-1",
        driver_id="driver-1",
        points=25.0,
        position=1,
        wins=1,
    )
    ds2 = DriverStanding(
        id="ds-2",
        race_id="race-1",
        driver_id="driver-2",
        points=18.0,
        position=2,
        wins=0,
    )
    cs1 = ConstructorStanding(
        id="cs-1",
        race_id="race-1",
        constructor_id="constructor-1",
        points=43.0,
        position=1,
        wins=1,
    )
    pit = PitStop(
        id="pit-1",
        race_id="race-1",
        driver_id="driver-1",
        stop_number=1,
        lap=20,
        time_of_day="15:30:00",
        duration_ms=2500,
    )
    db.add_all(
        [
            driver2,
            constructor2,
            status,
            race,
            result1,
            result2,
            quali1,
            quali2,
            ds1,
            ds2,
            cs1,
            pit,
        ]
    )
    db.commit()
    return {
        **seed_data,
        "driver2": driver2,
        "constructor2": constructor2,
        "race": race,
        "status": status,
    }
