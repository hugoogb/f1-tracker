"""The ops endpoint and the ingest run log behind it.

Two things are being protected here. One is that the status page can never
disagree with `pnpm fastf1` about the Fast-F1 backlog — they read the same
function, and the test asserts the numbers match rather than trusting that.
The other is that a public endpoint stays a public endpoint: the run log keeps
an exception message for whoever has a psql prompt, and the API must not serve
it.
"""

import datetime

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.db.models import IngestRun, LapTime, Race
from src.ingestion.fastf1_payload import KIND_LAPS, KIND_QUALI_SECTORS
from src.ingestion.fastf1_targets import find_targets
from src.ingestion.full_load import record_ingest_run, run_target_name

UTC = datetime.UTC


def make_run(db, **overrides):
    defaults = {
        "id": "run-1",
        "target": "full",
        "started_at": datetime.datetime(2026, 9, 14, 6, 0, tzinfo=UTC),
        "finished_at": datetime.datetime(2026, 9, 14, 6, 4, tzinfo=UTC),
        "status": "ok",
        "rows_written": 120,
        "f1db_version": "v2026.14.0",
        "error": None,
    }
    run = IngestRun(**{**defaults, **overrides})
    db.add(run)
    db.commit()
    return run


# ── Endpoint shape ───────────────────────────────────────────────────────────


def test_counts_fall_back_to_a_real_count_without_postgres_statistics(client):
    """`reltuples` is a Postgres notion; everywhere else must still be exact.

    The suite runs on SQLite, which has no `pg_class`, so this is the fallback
    path rather than a contrived one — and the contract that matters is that a
    figure is only ever announced as an estimate when it genuinely is one.
    """
    data = client.get("/api/ops/status").json()

    assert data["estimatedCounts"] == []
    assert "lapTimes" in data["rowCounts"]
    assert all(isinstance(value, int) for value in data["rowCounts"].values())


def test_every_estimated_key_is_a_row_count_key(client):
    """An estimate flag that names a key the counts do not carry is a UI bug."""
    data = client.get("/api/ops/status").json()

    assert set(data["estimatedCounts"]) <= set(data["rowCounts"])


def test_status_returns_every_section_on_an_empty_database(client):
    response = client.get("/api/ops/status")
    assert response.status_code == 200
    data = response.json()

    assert set(data) == {
        "generatedAt",
        "coverage",
        "fastf1",
        "rowCounts",
        "estimatedCounts",
        "ingest",
        "schemaVersion",
    }
    assert data["coverage"]["firstSeason"] is None
    assert data["coverage"]["latestResult"] is None
    assert data["coverage"]["currentSeason"] is None
    assert data["coverage"]["seasonInProgress"] is False
    assert data["rowCounts"]["races"] == 0


def test_status_reports_coverage_from_the_data(client, race_seed_data):
    coverage = client.get("/api/ops/status").json()["coverage"]

    assert coverage["firstSeason"] == 2023
    assert coverage["lastSeason"] == 2023
    assert coverage["totalRaces"] == 1
    assert coverage["racesWithResults"] == 1
    assert coverage["latestResult"] == {"year": 2023, "round": 1, "date": "2023-03-05"}


def test_status_reports_row_counts_per_table(client, race_seed_data):
    counts = client.get("/api/ops/status").json()["rowCounts"]

    assert counts["drivers"] == 2
    assert counts["constructors"] == 2
    assert counts["raceResults"] == 2
    assert counts["qualifyingResults"] == 2
    assert counts["pitStops"] == 1
    assert counts["lapTimes"] == 0


def test_status_calls_a_season_in_progress_while_rounds_remain(client, seed_data, db):
    """A round nobody has raced yet is what makes a season "in progress"."""
    db.add_all(
        [
            Race(
                id="future-1",
                season_year=2023,
                round=2,
                name="Next Grand Prix",
                circuit_id="circuit-1",
                date=datetime.date.today() + datetime.timedelta(days=30),
            ),
        ]
    )
    db.commit()

    coverage = client.get("/api/ops/status").json()["coverage"]
    assert coverage["seasonInProgress"] is True
    assert coverage["currentSeason"] == {
        "year": 2023,
        "totalRounds": 1,
        "roundsRun": 0,
        "roundsRemaining": 1,
    }


def test_status_calls_a_finished_season_not_in_progress(client, race_seed_data):
    coverage = client.get("/api/ops/status").json()["coverage"]
    assert coverage["seasonInProgress"] is False
    assert coverage["currentSeason"]["roundsRemaining"] == 0


# ── Fast-F1 backlog ──────────────────────────────────────────────────────────


def test_backlog_agrees_with_find_targets(client, race_seed_data, db):
    """The page and `pnpm fastf1` must never disagree about what is outstanding."""
    expected = find_targets(db, need={KIND_LAPS, KIND_QUALI_SECTORS}, oldest_first=True)

    fastf1 = client.get("/api/ops/status").json()["fastf1"]

    assert fastf1["backlog"] == len(expected) == 1
    assert fastf1["oldest"][0]["year"] == expected[0]["year"]
    assert fastf1["oldest"][0]["round"] == expected[0]["round"]
    assert fastf1["oldest"][0]["need"] == expected[0]["need"]


def test_backlog_shrinks_as_data_lands(client, race_seed_data, db):
    db.add(
        LapTime(
            id="lap-1",
            race_id="race-1",
            driver_id="driver-1",
            lap_number=1,
            position=1,
            time_millis=95_000,
        )
    )
    db.commit()

    fastf1 = client.get("/api/ops/status").json()["fastf1"]
    assert fastf1["oldest"][0]["need"] == [KIND_QUALI_SECTORS]
    assert fastf1["backlog"] == len(
        find_targets(db, need={KIND_LAPS, KIND_QUALI_SECTORS}, oldest_first=True)
    )


# ── Ingest runs ──────────────────────────────────────────────────────────────


def test_ingest_section_is_empty_rather_than_missing_when_nothing_has_run(client):
    ingest = client.get("/api/ops/status").json()["ingest"]
    assert ingest == {"available": True, "runs": [], "lastSuccessAt": None}


def test_ingest_section_reports_the_last_successful_run(client, db):
    make_run(db)

    ingest = client.get("/api/ops/status").json()["ingest"]
    assert ingest["lastSuccessAt"] == "2026-09-14T06:04:00Z"
    assert ingest["runs"][0] == {
        "target": "full",
        "status": "ok",
        "startedAt": "2026-09-14T06:00:00Z",
        "finishedAt": "2026-09-14T06:04:00Z",
        "rowsWritten": 120,
        "f1dbVersion": "v2026.14.0",
        "failed": False,
    }


def test_runs_come_back_newest_first(client, db):
    make_run(db, id="old", started_at=datetime.datetime(2026, 9, 7, 6, 0, tzinfo=UTC))
    make_run(db, id="new", started_at=datetime.datetime(2026, 9, 14, 6, 0, tzinfo=UTC))

    runs = client.get("/api/ops/status").json()["ingest"]["runs"]
    assert [r["startedAt"] for r in runs] == ["2026-09-14T06:00:00Z", "2026-09-07T06:00:00Z"]


def test_a_failed_run_is_flagged_but_its_message_is_never_served(client, db):
    """The column is a debugging aid on the box, not something a status page prints.

    An exception string can carry the failing statement, or a DSN with its
    password in it. The endpoint says a run failed and when, and nothing else.
    """
    secret = "OperationalError: could not connect to postgresql://f1:hunter2@10.0.0.4:5432/f1_api"
    make_run(db, status="error", rows_written=None, error=secret)

    response = client.get("/api/ops/status")
    body = response.text
    ingest = response.json()["ingest"]

    assert ingest["runs"][0]["failed"] is True
    assert ingest["runs"][0]["status"] == "error"
    assert ingest["lastSuccessAt"] is None
    assert "hunter2" not in body
    assert "10.0.0.4" not in body
    assert "error" not in ingest["runs"][0]


def test_an_in_flight_run_has_no_finish_time(client, db):
    make_run(db, status="running", finished_at=None, rows_written=None)

    run = client.get("/api/ops/status").json()["ingest"]["runs"][0]
    assert run["status"] == "running"
    assert run["finishedAt"] is None
    assert run["failed"] is False


def test_the_run_limit_is_honoured(client, db):
    for i in range(5):
        make_run(db, id=f"run-{i}", started_at=datetime.datetime(2026, 9, i + 1, 6, 0, tzinfo=UTC))

    assert len(client.get("/api/ops/status?runs=2").json()["ingest"]["runs"]) == 2


def test_status_survives_a_database_without_the_run_log(client, db):
    """An old database that has not migrated still has a story worth telling."""
    IngestRun.__table__.drop(bind=db.get_bind())

    response = client.get("/api/ops/status")
    assert response.status_code == 200
    data = response.json()
    assert data["ingest"] == {"available": False, "runs": [], "lastSuccessAt": None}
    # The sections after it still answer — the failed read must not poison them.
    assert data["rowCounts"]["races"] == 0


def test_schema_version_is_none_when_the_database_is_unstamped(client):
    """SQLite here has no alembic_version table; that is a null, not a 500."""
    assert client.get("/api/ops/status").json()["schemaVersion"] is None


# ── The run-log context manager ──────────────────────────────────────────────


@pytest.fixture()
def run_log():
    """An isolated database holding nothing but `ingest_runs`."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    IngestRun.__table__.create(bind=engine)
    factory = sessionmaker(bind=engine)
    yield factory
    engine.dispose()


def rows(factory) -> list[IngestRun]:
    with factory() as session:
        return session.execute(select(IngestRun).order_by(IngestRun.started_at)).scalars().all()


def test_a_completed_run_is_logged_as_ok(run_log):
    with record_ingest_run("base", session_factory=run_log) as run:
        run.rows_written = 42

    (logged,) = rows(run_log)
    assert logged.target == "base"
    assert logged.status == "ok"
    assert logged.rows_written == 42
    assert logged.started_at is not None
    assert logged.finished_at is not None
    assert logged.error is None


def test_a_crash_leaves_an_error_row_and_still_raises(run_log):
    with pytest.raises(ValueError, match="f1db release 404"):
        with record_ingest_run("results", session_factory=run_log):
            raise ValueError("f1db release 404")

    (logged,) = rows(run_log)
    assert logged.status == "error"
    assert logged.finished_at is not None
    assert logged.error == "ValueError: f1db release 404"


def test_an_interrupt_is_recorded_rather_than_swallowed(run_log):
    """A run killed part-way is not a success, and BaseException still propagates."""
    with pytest.raises(KeyboardInterrupt):
        with record_ingest_run("full", session_factory=run_log):
            raise KeyboardInterrupt

    (logged,) = rows(run_log)
    assert logged.status == "error"


def test_a_long_error_is_truncated_before_it_is_stored(run_log):
    with pytest.raises(RuntimeError):
        with record_ingest_run("full", session_factory=run_log):
            raise RuntimeError("x" * 5000)

    (logged,) = rows(run_log)
    assert len(logged.error) == 200


def test_the_row_is_written_before_the_work_starts(run_log):
    """So a process killed outright leaves a `running` row rather than nothing."""
    with record_ingest_run("laptimes", session_factory=run_log):
        (in_flight,) = rows(run_log)
        assert in_flight.status == "running"
        assert in_flight.finished_at is None


def test_a_missing_table_never_takes_the_ingest_down():
    """An old database that has not migrated still gets its data loaded."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    factory = sessionmaker(bind=engine)

    did_work = False
    with record_ingest_run("full", session_factory=factory):
        did_work = True

    assert did_work
    engine.dispose()


def test_a_missing_table_does_not_mask_the_ingests_own_failure():
    engine = create_engine("sqlite://", poolclass=StaticPool)
    factory = sessionmaker(bind=engine)

    with pytest.raises(ValueError):
        with record_ingest_run("full", session_factory=factory):
            raise ValueError("the real failure")

    engine.dispose()


def test_run_target_names_the_flags_that_were_asked_for():
    assert run_target_name(None) == "full"
    assert run_target_name({"base"}) == "base"
    assert run_target_name({"results", "base"}) == "base,results"
