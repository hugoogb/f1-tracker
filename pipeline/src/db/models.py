import uuid

from sqlalchemy import (
    BigInteger,
    Date,
    Float,
    ForeignKey,
    Integer,
    String,
    Time,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.db.database import Base


def new_uuid() -> str:
    return str(uuid.uuid4())


class Season(Base):
    __tablename__ = "seasons"

    year: Mapped[int] = mapped_column(Integer, primary_key=True)
    url: Mapped[str | None] = mapped_column(String)

    races: Mapped[list["Race"]] = relationship(back_populates="season")


class Circuit(Base):
    __tablename__ = "circuits"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_uuid)
    ref: Mapped[str] = mapped_column(String, unique=True, index=True)
    name: Mapped[str] = mapped_column(String)
    location: Mapped[str | None] = mapped_column(String)
    country: Mapped[str | None] = mapped_column(String)
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    altitude: Mapped[int | None] = mapped_column(Integer)
    url: Mapped[str | None] = mapped_column(String)

    races: Mapped[list["Race"]] = relationship(back_populates="circuit")
    layouts: Mapped[list["CircuitLayout"]] = relationship(
        back_populates="circuit", order_by="CircuitLayout.layout_number"
    )


class CircuitLayout(Base):
    __tablename__ = "circuit_layouts"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_uuid)
    circuit_id: Mapped[str] = mapped_column(ForeignKey("circuits.id"), index=True)
    layout_number: Mapped[int] = mapped_column(Integer)
    svg_id: Mapped[str] = mapped_column(String)
    seasons_active: Mapped[str] = mapped_column(String)

    circuit: Mapped["Circuit"] = relationship(back_populates="layouts")


class Driver(Base):
    __tablename__ = "drivers"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_uuid)
    ref: Mapped[str] = mapped_column(String, unique=True, index=True)
    number: Mapped[int | None] = mapped_column(Integer)
    code: Mapped[str | None] = mapped_column(String(3))
    first_name: Mapped[str] = mapped_column(String)
    last_name: Mapped[str] = mapped_column(String)
    date_of_birth: Mapped[str | None] = mapped_column(Date)
    nationality: Mapped[str | None] = mapped_column(String)
    url: Mapped[str | None] = mapped_column(String)


class Constructor(Base):
    __tablename__ = "constructors"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_uuid)
    ref: Mapped[str] = mapped_column(String, unique=True, index=True)
    name: Mapped[str] = mapped_column(String)
    nationality: Mapped[str | None] = mapped_column(String)
    color: Mapped[str | None] = mapped_column(String(7))
    url: Mapped[str | None] = mapped_column(String)


class Status(Base):
    __tablename__ = "statuses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    description: Mapped[str] = mapped_column(String)


class Race(Base):
    __tablename__ = "races"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_uuid)
    season_year: Mapped[int] = mapped_column(ForeignKey("seasons.year"), index=True)
    round: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(String)
    circuit_id: Mapped[str] = mapped_column(ForeignKey("circuits.id"))
    date: Mapped[str | None] = mapped_column(Date)
    time: Mapped[str | None] = mapped_column(Time)
    url: Mapped[str | None] = mapped_column(String)

    season: Mapped["Season"] = relationship(back_populates="races")
    circuit: Mapped["Circuit"] = relationship(back_populates="races")
    results: Mapped[list["RaceResult"]] = relationship(back_populates="race")
    qualifying_results: Mapped[list["QualifyingResult"]] = relationship(back_populates="race")
    pit_stops: Mapped[list["PitStop"]] = relationship(back_populates="race")


class RaceResult(Base):
    __tablename__ = "race_results"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_uuid)
    race_id: Mapped[str] = mapped_column(ForeignKey("races.id"), index=True)
    driver_id: Mapped[str] = mapped_column(ForeignKey("drivers.id"), index=True)
    constructor_id: Mapped[str] = mapped_column(ForeignKey("constructors.id"))
    number: Mapped[int | None] = mapped_column(Integer)
    grid: Mapped[int | None] = mapped_column(Integer)
    position: Mapped[int | None] = mapped_column(Integer)
    position_text: Mapped[str | None] = mapped_column(String)
    points: Mapped[float] = mapped_column(Float, default=0)
    laps: Mapped[int | None] = mapped_column(Integer)
    time_text: Mapped[str | None] = mapped_column(String)
    time_millis: Mapped[int | None] = mapped_column(BigInteger)
    fastest_lap: Mapped[int | None] = mapped_column(Integer)
    fastest_lap_time: Mapped[str | None] = mapped_column(String)
    fastest_lap_speed: Mapped[str | None] = mapped_column(String)
    status_id: Mapped[int | None] = mapped_column(ForeignKey("statuses.id"))

    race: Mapped["Race"] = relationship(back_populates="results")
    driver: Mapped["Driver"] = relationship()
    constructor: Mapped["Constructor"] = relationship()
    status: Mapped["Status | None"] = relationship()


class QualifyingResult(Base):
    __tablename__ = "qualifying_results"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_uuid)
    race_id: Mapped[str] = mapped_column(ForeignKey("races.id"), index=True)
    driver_id: Mapped[str] = mapped_column(ForeignKey("drivers.id"), index=True)
    constructor_id: Mapped[str] = mapped_column(ForeignKey("constructors.id"))
    number: Mapped[int | None] = mapped_column(Integer)
    position: Mapped[int | None] = mapped_column(Integer)
    q1: Mapped[str | None] = mapped_column(String)
    q2: Mapped[str | None] = mapped_column(String)
    q3: Mapped[str | None] = mapped_column(String)

    race: Mapped["Race"] = relationship(back_populates="qualifying_results")
    driver: Mapped["Driver"] = relationship()
    constructor: Mapped["Constructor"] = relationship()


class DriverStanding(Base):
    __tablename__ = "driver_standings"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_uuid)
    race_id: Mapped[str] = mapped_column(ForeignKey("races.id"), index=True)
    driver_id: Mapped[str] = mapped_column(ForeignKey("drivers.id"), index=True)
    points: Mapped[float] = mapped_column(Float, default=0)
    position: Mapped[int | None] = mapped_column(Integer)
    wins: Mapped[int] = mapped_column(Integer, default=0)

    race: Mapped["Race"] = relationship()
    driver: Mapped["Driver"] = relationship()


class ConstructorStanding(Base):
    __tablename__ = "constructor_standings"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_uuid)
    race_id: Mapped[str] = mapped_column(ForeignKey("races.id"), index=True)
    constructor_id: Mapped[str] = mapped_column(ForeignKey("constructors.id"), index=True)
    points: Mapped[float] = mapped_column(Float, default=0)
    position: Mapped[int | None] = mapped_column(Integer)
    wins: Mapped[int] = mapped_column(Integer, default=0)

    race: Mapped["Race"] = relationship()
    constructor: Mapped["Constructor"] = relationship()


class PitStop(Base):
    __tablename__ = "pit_stops"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_uuid)
    race_id: Mapped[str] = mapped_column(ForeignKey("races.id"), index=True)
    driver_id: Mapped[str] = mapped_column(ForeignKey("drivers.id"), index=True)
    stop_number: Mapped[int] = mapped_column(Integer)
    lap: Mapped[int] = mapped_column(Integer)
    time_of_day: Mapped[str | None] = mapped_column(String)
    duration_ms: Mapped[int | None] = mapped_column(BigInteger)

    race: Mapped["Race"] = relationship(back_populates="pit_stops")
    driver: Mapped["Driver"] = relationship()


class LapTime(Base):
    __tablename__ = "lap_times"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_uuid)
    race_id: Mapped[str] = mapped_column(ForeignKey("races.id"), index=True)
    driver_id: Mapped[str] = mapped_column(ForeignKey("drivers.id"), index=True)
    lap_number: Mapped[int] = mapped_column(Integer)
    time_millis: Mapped[int | None] = mapped_column(BigInteger)
    sector1_ms: Mapped[int | None] = mapped_column(BigInteger)
    sector2_ms: Mapped[int | None] = mapped_column(BigInteger)
    sector3_ms: Mapped[int | None] = mapped_column(BigInteger)
    compound: Mapped[str | None] = mapped_column(String)
    stint: Mapped[int | None] = mapped_column(Integer)
    tyre_life: Mapped[int | None] = mapped_column(Integer)

    race: Mapped["Race"] = relationship()
    driver: Mapped["Driver"] = relationship()


class SprintResult(Base):
    __tablename__ = "sprint_results"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_uuid)
    race_id: Mapped[str] = mapped_column(ForeignKey("races.id"), index=True)
    driver_id: Mapped[str] = mapped_column(ForeignKey("drivers.id"), index=True)
    constructor_id: Mapped[str] = mapped_column(ForeignKey("constructors.id"))
    number: Mapped[int | None] = mapped_column(Integer)
    grid: Mapped[int | None] = mapped_column(Integer)
    position: Mapped[int | None] = mapped_column(Integer)
    position_text: Mapped[str | None] = mapped_column(String)
    points: Mapped[float] = mapped_column(Float, default=0)
    laps: Mapped[int | None] = mapped_column(Integer)
    time_text: Mapped[str | None] = mapped_column(String)
    status_id: Mapped[int | None] = mapped_column(ForeignKey("statuses.id"))

    race: Mapped["Race"] = relationship()
    driver: Mapped["Driver"] = relationship()
    constructor: Mapped["Constructor"] = relationship()
    status: Mapped["Status | None"] = relationship()
