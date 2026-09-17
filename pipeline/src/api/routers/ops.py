"""Operational status: what the database holds and when it was last filled.

Feeds the public `/status` page. Everything here is either a count, a
timestamp, a season/round number or a revision id — deliberately, because the
endpoint is unauthenticated like the rest of the API. Nothing on it should ever
identify a host, a database, a file path or a credential.

The one judgement call is the `error` column on `ingest_runs`. A SQLAlchemy
exception string can carry the statement it failed on, and a driver-level
connection error can carry the DSN with its password. That is exactly the sort
of thing that leaks from a status page, so the message is kept in the database
for whoever has a psql prompt and never served: the API reports *that* a run
failed and when, and stops there.
"""

from datetime import UTC, date, datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from src.db.database import get_db
from src.db.models import (
    Circuit,
    Constructor,
    ConstructorLineage,
    ConstructorStanding,
    Driver,
    DriverStanding,
    IngestRun,
    LapTime,
    PitStop,
    QualifyingResult,
    Race,
    RaceResult,
    Season,
    SprintResult,
)
from src.db.queries import race_has_happened
from src.ingestion.fastf1_payload import KINDS
from src.ingestion.fastf1_targets import find_targets

router = APIRouter()

DEFAULT_RUN_LIMIT = 10
MAX_RUN_LIMIT = 50

# Enough to see the shape of the backlog without turning the endpoint into a
# second copy of `fastf1_status.py`'s target list.
BACKLOG_SAMPLE = 5

# Same pattern as /stats, widened: the tables whose row counts say something
# about whether the data is complete.
_COUNTED_TABLES = {
    "seasons": Season,
    "races": Race,
    "drivers": Driver,
    "constructors": Constructor,
    "circuits": Circuit,
    "raceResults": RaceResult,
    "qualifyingResults": QualifyingResult,
    "sprintResults": SprintResult,
    "driverStandings": DriverStanding,
    "constructorStandings": ConstructorStanding,
    "pitStops": PitStop,
    "lapTimes": LapTime,
    "constructorLineages": ConstructorLineage,
}


def _utc_iso(moment: datetime | None) -> str | None:
    """Render a timestamp as an explicit UTC instant.

    `ingest_runs` is written with tz-aware UTC values, but a driver that drops
    the offset on the way back (SQLite does) would otherwise hand the browser a
    naive string it reads as local time.
    """
    if moment is None:
        return None
    aware = moment if moment.tzinfo else moment.replace(tzinfo=UTC)
    return aware.astimezone(UTC).isoformat().replace("+00:00", "Z")


def _coverage(db: Session) -> dict:
    """What span of history is loaded, and how far into it results reach."""
    first_season, last_season = db.execute(
        select(func.min(Season.year), func.max(Season.year))
    ).one()
    total_races = db.execute(select(func.count()).select_from(Race)).scalar() or 0

    # The most recent round that has actually been raced. Not the same as the
    # last round on the calendar: mid-season the calendar runs months ahead.
    latest = db.execute(
        select(Race.season_year, Race.round, Race.date)
        .join(RaceResult, RaceResult.race_id == Race.id)
        .order_by(Race.season_year.desc(), Race.round.desc())
        .limit(1)
    ).first()

    races_with_results = (
        db.execute(select(func.count(func.distinct(RaceResult.race_id)))).scalar() or 0
    )

    season = _current_season(db, last_season)
    return {
        "firstSeason": first_season,
        "lastSeason": last_season,
        "totalRaces": total_races,
        "racesWithResults": races_with_results,
        "latestResult": {
            "year": latest.season_year,
            "round": latest.round,
            "date": latest.date.isoformat() if latest.date else None,
        }
        if latest
        else None,
        "currentSeason": season,
        "seasonInProgress": bool(season and season["roundsRemaining"] > 0),
    }


def _current_season(db: Session, year: int | None) -> dict | None:
    """The newest season's calendar, split into rounds run and rounds to come.

    "Run" is `race_has_happened` — the same rule that decides whether a title
    has been awarded — so the page cannot disagree with `/champions` about
    whether a season is over.
    """
    if year is None:
        return None

    races = db.execute(select(Race).where(Race.season_year == year)).scalars().all()
    if not races:
        return None

    today = date.today()
    run = [r for r in races if race_has_happened(r, today)]
    return {
        "year": year,
        "totalRounds": len(races),
        "roundsRun": len(run),
        "roundsRemaining": len(races) - len(run),
    }


def _fastf1_backlog(db: Session) -> dict:
    """Races still waiting on a Fast-F1 fetch.

    Straight from `find_targets`, which is what `pnpm fastf1` acts on. The point
    of sharing it is that this number and the sync script's can never drift:
    a page reporting a backlog nobody is going to fetch is worse than no page.
    """
    targets = find_targets(db, need=set(KINDS), oldest_first=True)
    return {
        "backlog": len(targets),
        "oldest": [
            {
                "year": t["year"],
                "round": t["round"],
                "date": t["date"],
                "need": t["need"],
            }
            for t in targets[:BACKLOG_SAMPLE]
        ],
    }


# Tables big enough that an exact COUNT(*) is not worth what it costs. Postgres
# has no cached row count, so COUNT(*) is a sequential scan of the whole table —
# `lap_times` is hundreds of thousands of rows and grows with every race. Behind
# a 60-second cache that is ~1,440 scans a day on the shared production cluster,
# to render a number nobody reads to the unit.
_ESTIMATED_TABLES = {"lapTimes"}


def _estimate_rows(db: Session, table: str) -> int | None:
    """Postgres' own row estimate for a table, or None if it has none.

    `reltuples` is maintained by ANALYZE and the autovacuum daemon, so it is a
    statistic rather than a count: cheap, and close enough for a status page.
    It is -1 on a table that has never been analysed, which is the case a fresh
    restore hits, so that reads as "no estimate" and the caller counts properly.
    """
    try:
        estimate = db.execute(
            text("SELECT reltuples::bigint FROM pg_class WHERE oid = to_regclass(:name)"),
            {"name": table},
        ).scalar()
    except SQLAlchemyError:
        # Not Postgres (the test suite runs on SQLite), or no permission on
        # pg_class. Either way there is no estimate and COUNT(*) is the answer.
        return None
    return None if estimate is None or estimate < 0 else int(estimate)


def _row_counts(db: Session) -> tuple[dict[str, int], list[str]]:
    """Row counts per table, and which of them are estimates rather than counts.

    The two are reported separately so the page can mark an estimate as one. A
    number that is sometimes exact and sometimes 3% out, with nothing saying
    which, is worse than either on its own.
    """
    counts: dict[str, int] = {}
    estimated: list[str] = []
    for name, model in _COUNTED_TABLES.items():
        if name in _ESTIMATED_TABLES:
            estimate = _estimate_rows(db, model.__tablename__)
            if estimate is not None:
                counts[name] = estimate
                estimated.append(name)
                continue
        counts[name] = db.execute(select(func.count()).select_from(model)).scalar() or 0
    return counts, estimated


def _serialise_run(run: IngestRun) -> dict:
    return {
        "target": run.target,
        "status": run.status,
        "startedAt": _utc_iso(run.started_at),
        "finishedAt": _utc_iso(run.finished_at),
        "rowsWritten": run.rows_written,
        "f1dbVersion": run.f1db_version,
        # Deliberately a flag and not the message — see the module docstring.
        "failed": run.status == "error",
    }


def _ingest_runs(db: Session, limit: int) -> dict:
    """The last few runs, and when one last succeeded.

    Absent on a database that predates the migration, which is a state the
    endpoint has to survive rather than 500 on: the status page is most useful
    exactly when something is behind.
    """
    try:
        runs = (
            db.execute(select(IngestRun).order_by(IngestRun.started_at.desc()).limit(limit))
            .scalars()
            .all()
        )
        last_success = db.execute(
            select(func.max(IngestRun.finished_at)).where(IngestRun.status == "ok")
        ).scalar()
    except SQLAlchemyError:
        # The failed statement leaves the session unusable, and this request has
        # written nothing, so rolling back is free and keeps later reads working.
        db.rollback()
        return {"available": False, "runs": [], "lastSuccessAt": None}

    return {
        "available": True,
        "runs": [_serialise_run(r) for r in runs],
        "lastSuccessAt": _utc_iso(last_success),
    }


def _schema_version(db: Session) -> str | None:
    """The Alembic revision the database is stamped with, or None if unstamped."""
    try:
        return db.execute(text("SELECT version_num FROM alembic_version")).scalar()
    except SQLAlchemyError:
        db.rollback()
        return None


@router.get("/ops/status")
def ops_status(
    runs: int = Query(DEFAULT_RUN_LIMIT, ge=1, le=MAX_RUN_LIMIT),
    db: Session = Depends(get_db),
):
    """Counts, timestamps and revision ids. Nothing that identifies a host."""
    counts, estimated = _row_counts(db)
    return {
        "generatedAt": _utc_iso(datetime.now(UTC)),
        "coverage": _coverage(db),
        "fastf1": _fastf1_backlog(db),
        "rowCounts": counts,
        "estimatedCounts": estimated,
        "ingest": _ingest_runs(db, runs),
        "schemaVersion": _schema_version(db),
    }
