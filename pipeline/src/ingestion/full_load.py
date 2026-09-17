"""Orchestrates a complete data load into PostgreSQL.

Structural and historical data comes from an f1db release download; lap
times and qualifying sector times come from Fast-F1 session data (2018+).
"""

import logging
import time
from collections.abc import Collection, Iterator
from contextlib import contextmanager
from datetime import UTC, datetime

from sqlalchemy import text, update
from sqlalchemy.orm import Session

from src.config import settings
from src.db.database import SessionLocal
from src.db.models import Driver, IngestRun, QualifyingResult, Race, RaceResult, new_uuid
from src.ingestion.colors import ConstructorColorIngestor
from src.ingestion.drivers import ConstructorIngestor, DriverIngestor, StatusIngestor
from src.ingestion.lap_times import LapTimeIngestor
from src.ingestion.lineages import ConstructorLineageIngestor
from src.ingestion.pit_stops import PitStopIngestor
from src.ingestion.qualifying_sectors import QualifyingSectorIngestor
from src.ingestion.races import RaceIngestor
from src.ingestion.results import QualifyingIngestor, RaceResultIngestor, SprintResultIngestor
from src.ingestion.seasons import CircuitIngestor, CircuitLayoutIngestor, SeasonIngestor
from src.ingestion.standings import StandingsIngestor

logger = logging.getLogger(__name__)

# ── Run log ──────────────────────────────────────────────────────────────────

STATUS_RUNNING = "running"
STATUS_OK = "ok"
STATUS_ERROR = "error"

# A SQLAlchemy exception string can run to the whole failing statement, and a
# driver-level connection error can carry the DSN — password included. The
# column is a debugging aid for whoever has a psql prompt on the box, never
# something to serve, so it is cut down to a line rather than kept whole.
ERROR_MAX_CHARS = 200


class IngestRunHandle:
    """What a running ingest can report back into its own log row.

    Only `rows_written`, and only for a caller that genuinely counts what it
    wrote: the f1db ingestors merge row by row and return no total, so theirs
    stays NULL rather than being guessed at.
    """

    def __init__(self) -> None:
        self.rows_written: int | None = None


def _error_text(exc: BaseException) -> str:
    return f"{type(exc).__name__}: {exc}"[:ERROR_MAX_CHARS]


def _quietly(action) -> bool:
    """Run a run-log database call, downgrading any failure to a warning.

    The log exists to explain an ingest, so it must never be the reason one
    fails. The usual cause is a database that has not run the migration that
    created `ingest_runs` yet, which is precisely the case where the ingest
    itself still has useful work to do.
    """
    try:
        action()
        return True
    # A broken log must never be the thing that breaks a load.
    except Exception as exc:
        logger.warning(f"Ingest run log unavailable — continuing without it: {exc}")
        return False


def _open_run(target: str, session_factory) -> tuple[Session | None, str | None]:
    """Write the `running` row, up front, so a crash leaves evidence behind."""
    try:
        db = session_factory()
    except Exception as exc:
        logger.warning(f"Ingest run log unavailable — continuing without it: {exc}")
        return None, None

    run_id = new_uuid()

    def write():
        db.add(
            IngestRun(
                id=run_id,
                target=target,
                started_at=datetime.now(UTC),
                status=STATUS_RUNNING,
                f1db_version=settings.f1db_version,
            )
        )
        db.commit()

    if not _quietly(write):
        _quietly(db.rollback)
        _quietly(db.close)
        return None, None
    return db, run_id


def _close_run(
    db: Session | None,
    run_id: str | None,
    status: str,
    rows_written: int | None,
    exc: BaseException | None,
) -> None:
    if db is None or run_id is None:
        return

    def write():
        db.execute(
            update(IngestRun)
            .where(IngestRun.id == run_id)
            .values(
                finished_at=datetime.now(UTC),
                status=status,
                rows_written=rows_written,
                error=_error_text(exc) if exc is not None else None,
            )
        )
        db.commit()

    if not _quietly(write):
        _quietly(db.rollback)


@contextmanager
def record_ingest_run(target: str, session_factory=SessionLocal) -> Iterator[IngestRunHandle]:
    """Record one ingest attempt in `ingest_runs`, however it ends.

    The row goes in before the work starts and is stamped with an outcome on
    the way out — including when that outcome is an exception, which is the
    case the log is really for. A run that leaves a `running` row behind was
    killed outright.

    It keeps its own session, deliberately. The ingest's session is unusable
    after a failed statement, so sharing one would mean the error row could
    only ever be written for the failures that did not involve the database.
    """
    handle = IngestRunHandle()
    db, run_id = _open_run(target, session_factory)
    try:
        yield handle
    except BaseException as exc:
        _close_run(db, run_id, STATUS_ERROR, handle.rows_written, exc)
        raise
    else:
        _close_run(db, run_id, STATUS_OK, handle.rows_written, None)
    finally:
        if db is not None:
            _quietly(db.close)


def backfill_driver_numbers(db: Session) -> None:
    """Fill in car numbers for drivers who never held a permanent one.

    f1db supplies `permanentNumber`, which only exists for the modern era. For
    everyone else, fall back to the number they carried in their most recent
    race so driver pages still show one. Existing permanent numbers are kept.
    """
    logger.info("Backfilling driver numbers from race results...")

    results = db.query(RaceResult).order_by(RaceResult.race_id.desc()).all()

    seen = set()
    updated = 0
    for result in results:
        if result.driver_id in seen or result.number is None:
            continue
        seen.add(result.driver_id)

        driver = db.get(Driver, result.driver_id)
        if driver and driver.number is None:
            driver.number = result.number
            updated += 1

    db.commit()
    logger.info(f"Backfilled {updated} driver numbers")


def refresh_materialized_views(db: Session) -> None:
    """Create or refresh materialized views for computed stats."""
    logger.info("Creating/refreshing materialized views...")

    # Drop existing views first
    db.execute(text("DROP MATERIALIZED VIEW IF EXISTS season_champions CASCADE"))
    db.execute(text("DROP MATERIALIZED VIEW IF EXISTS driver_career_stats CASCADE"))
    db.execute(text("DROP MATERIALIZED VIEW IF EXISTS constructor_career_stats CASCADE"))

    # Season champions: position=1 in final round standings
    db.execute(
        text("""
        CREATE MATERIALIZED VIEW season_champions AS
        SELECT
            r.season_year AS year,
            ds.driver_id,
            ds.points AS driver_points,
            cs.constructor_id,
            cs.points AS constructor_points
        FROM driver_standings ds
        JOIN races r ON ds.race_id = r.id
        LEFT JOIN constructor_standings cs
            ON cs.race_id = r.id AND cs.position = 1
        WHERE ds.position = 1
        AND r.round = (
            SELECT MAX(r2.round)
            FROM races r2
            WHERE r2.season_year = r.season_year
        )
        ORDER BY r.season_year
    """)
    )

    # Driver career stats
    db.execute(
        text("""
        CREATE MATERIALIZED VIEW driver_career_stats AS
        SELECT
            rr.driver_id,
            COUNT(*) AS total_races,
            COUNT(*) FILTER (WHERE rr.position = 1) AS wins,
            COUNT(*) FILTER (WHERE rr.position <= 3) AS podiums,
            COALESCE(SUM(rr.points), 0) AS total_points,
            COUNT(DISTINCT r.season_year) AS seasons
        FROM race_results rr
        JOIN races r ON rr.race_id = r.id
        GROUP BY rr.driver_id
    """)
    )

    # Constructor career stats
    db.execute(
        text("""
        CREATE MATERIALIZED VIEW constructor_career_stats AS
        SELECT
            rr.constructor_id,
            COUNT(*) AS total_entries,
            COUNT(*) FILTER (WHERE rr.position = 1) AS wins,
            COUNT(*) FILTER (WHERE rr.position <= 3) AS podiums,
            COALESCE(SUM(rr.points), 0) AS total_points,
            COUNT(DISTINCT r.season_year) AS seasons
        FROM race_results rr
        JOIN races r ON rr.race_id = r.id
        GROUP BY rr.constructor_id
    """)
    )

    db.commit()
    logger.info("Materialized views created")


def _parse_lap_time_ms(time_str: str) -> int | None:
    """Parse a lap time string like '1:23.456' to milliseconds."""
    try:
        if ":" in time_str:
            mins, secs = time_str.split(":", 1)
            return int((int(mins) * 60 + float(secs)) * 1000)
        return int(float(time_str) * 1000)
    except (ValueError, TypeError):
        return None


def compute_race_aggregates(db: Session, race_ids: Collection[str] | None = None) -> None:
    """Compute and store fastest lap + fastest qualifying sectors on Race rows.

    Pass `race_ids` to recompute only those races — what the Fast-F1 payload
    importer does after loading a handful of sessions, rather than walking the
    whole schedule since 1950 for two race weekends.
    """
    scope = "all races" if race_ids is None else f"{len(race_ids)} race(s)"
    logger.info(f"Computing race aggregates (fastest lap + qualifying sectors) for {scope}...")

    query = db.query(Race)
    if race_ids is not None:
        ids = list(race_ids)
        if not ids:
            logger.info("No races to recompute")
            return
        query = query.filter(Race.id.in_(ids))
    races = query.all()
    updated = 0

    for race in races:
        changed = False

        # --- Fastest lap ---
        results = db.query(RaceResult).filter(RaceResult.race_id == race.id).all()
        best_ms = None
        best_result = None
        for r in results:
            if r.fastest_lap_time:
                ms = _parse_lap_time_ms(r.fastest_lap_time)
                if ms is not None and (best_ms is None or ms < best_ms):
                    best_ms = ms
                    best_result = r

        if best_result:
            race.fastest_lap_driver_id = best_result.driver_id
            race.fastest_lap_constructor_id = best_result.constructor_id
            race.fastest_lap_number = best_result.fastest_lap
            race.fastest_lap_time = best_result.fastest_lap_time
            race.fastest_lap_time_ms = best_ms
            race.fastest_lap_speed = best_result.fastest_lap_speed
            changed = True

        # --- Fastest qualifying sectors ---
        qualis = db.query(QualifyingResult).filter(QualifyingResult.race_id == race.id).all()
        for sector_idx, (s1_attr, s2_attr, s3_attr) in enumerate(
            [
                ("q1_s1_ms", "q2_s1_ms", "q3_s1_ms"),
                ("q1_s2_ms", "q2_s2_ms", "q3_s2_ms"),
                ("q1_s3_ms", "q2_s3_ms", "q3_s3_ms"),
            ],
            start=1,
        ):
            best_sector_ms = None
            best_sector_driver_id = None
            for q in qualis:
                for attr in (s1_attr, s2_attr, s3_attr):
                    val = getattr(q, attr, None)
                    if val is not None and (best_sector_ms is None or val < best_sector_ms):
                        best_sector_ms = val
                        best_sector_driver_id = q.driver_id

            if best_sector_driver_id:
                setattr(race, f"best_quali_s{sector_idx}_driver_id", best_sector_driver_id)
                setattr(race, f"best_quali_s{sector_idx}_ms", best_sector_ms)
                changed = True

        if changed:
            updated += 1

    db.commit()
    logger.info(f"Updated aggregates for {updated} races")


def _should_run(targets: set[str] | None, key: str) -> bool:
    return targets is None or key in targets


def run_target_name(targets: set[str] | None) -> str:
    """What to call this run in the log: "full", or the flags that were asked for."""
    return "full" if targets is None else ",".join(sorted(targets))


def run_full_load(
    targets: set[str] | None = None,
    year_range: tuple[int, int] | None = None,
    refresh_positions: bool = False,
) -> None:
    """Run the data load. If targets is None, run everything.
    If year_range is provided, only ingest data for seasons in [start, end].
    `refresh_positions` re-fetches lap data stored before per-lap positions
    were kept; see `LapTimeIngestor.ingest`.
    """
    db: Session = SessionLocal()
    start = time.time()

    label = (
        "full data load" if targets is None else f"selective load ({', '.join(sorted(targets))})"
    )
    if year_range:
        label += f" [{year_range[0]}-{year_range[1]}]"

    try:
        with record_ingest_run(run_target_name(targets)):
            logger.info("=" * 60)
            logger.info(f"Starting {label}...")
            logger.info("=" * 60)

            if _should_run(targets, "base"):
                logger.info("\n--- Phase 1: Independent entities ---")
                SeasonIngestor(db).ingest()
                CircuitIngestor(db).ingest()
                StatusIngestor(db).ingest()
                DriverIngestor(db).ingest()
                ConstructorIngestor(db).ingest()

                logger.info("\n--- Phase 2: Races ---")
                RaceIngestor(db).ingest(year_range=year_range)

            if _should_run(targets, "layouts"):
                logger.info("\n--- Circuit layouts ---")
                CircuitLayoutIngestor(db).ingest()

            if _should_run(targets, "colors"):
                logger.info("\n--- Constructor colors ---")
                ConstructorColorIngestor(db).ingest()

            if _should_run(targets, "lineages"):
                logger.info("\n--- Constructor lineages ---")
                ConstructorLineageIngestor(db).ingest()

            if _should_run(targets, "results"):
                logger.info("\n--- Race results ---")
                RaceResultIngestor(db).ingest(year_range=year_range)

            if _should_run(targets, "qualifying"):
                logger.info("\n--- Qualifying ---")
                QualifyingIngestor(db).ingest(year_range=year_range)

            if _should_run(targets, "sprints"):
                logger.info("\n--- Sprint results ---")
                SprintResultIngestor(db).ingest(year_range=year_range)

            if _should_run(targets, "standings"):
                logger.info("\n--- Standings ---")
                StandingsIngestor(db).ingest(year_range=year_range)

            if _should_run(targets, "pitstops"):
                logger.info("\n--- Pit stops ---")
                PitStopIngestor(db).ingest(year_range=year_range)

            if _should_run(targets, "laptimes"):
                logger.info("\n--- Lap times ---")
                LapTimeIngestor(db).ingest(
                    year_range=year_range, refresh_positions=refresh_positions
                )

            if _should_run(targets, "qualifying-sectors"):
                logger.info("\n--- Qualifying sectors ---")
                QualifyingSectorIngestor(db).ingest(year_range=year_range)

            if _should_run(targets, "postprocess"):
                logger.info("\n--- Post-processing ---")
                backfill_driver_numbers(db)
                compute_race_aggregates(db)
                refresh_materialized_views(db)

            elapsed = time.time() - start
            logger.info("=" * 60)
            logger.info(f"{label.capitalize()} complete in {elapsed:.1f}s")
            logger.info("=" * 60)

    except InterruptedError:
        logger.warning("Full load interrupted — progress saved to DB")
        raise
    except Exception as e:
        logger.error(f"Full load failed: {e}", exc_info=True)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)-5s %(message)s",
        datefmt="%H:%M:%S",
    )
    run_full_load()
