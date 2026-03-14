"""Orchestrates a complete data load from Fast-F1 into PostgreSQL."""

import logging
import time

from sqlalchemy import text
from sqlalchemy.orm import Session

from src.db.database import SessionLocal
from src.db.models import Driver, QualifyingResult, RaceResult
from src.ingestion.drivers import ConstructorIngestor, DriverIngestor, StatusIngestor
from src.ingestion.pit_stops import PitStopIngestor
from src.ingestion.races import RaceIngestor
from src.ingestion.results import QualifyingIngestor, RaceResultIngestor, SprintResultIngestor
from src.ingestion.circuit_layouts import CircuitLayoutIngestor
from src.ingestion.images import ConstructorColorIngestor, DriverHeadshotIngestor
from src.ingestion.seasons import CircuitIngestor, SeasonIngestor
from src.ingestion.standings import StandingsIngestor

logger = logging.getLogger(__name__)


def backfill_driver_codes(db: Session) -> None:
    """Backfill driver number and code from their most recent race result."""
    logger.info("Backfilling driver numbers and codes from race results...")

    # Get the most recent race result for each driver to extract number/code
    results = db.query(RaceResult).order_by(RaceResult.race_id.desc()).all()

    seen = set()
    updated = 0
    for result in results:
        if result.driver_id in seen:
            continue
        seen.add(result.driver_id)

        driver = db.get(Driver, result.driver_id)
        if driver and result.number is not None:
            driver.number = result.number
            # Try to get code from the driverId pattern or leave as-is
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


def backfill_qualifying(db: Session) -> None:
    """Generate qualifying_results from race_results.grid for races missing qualifying."""
    logger.info("Backfilling qualifying from race result grid positions...")

    # Find race_ids that have results but no qualifying
    races_with_results = set(
        db.query(RaceResult.race_id).group_by(RaceResult.race_id).all()
    )
    races_with_quali = set(
        db.query(QualifyingResult.race_id).group_by(QualifyingResult.race_id).all()
    )
    # SQLAlchemy returns tuples from .all(), extract the values
    races_with_results = {r[0] for r in races_with_results}
    races_with_quali = {r[0] for r in races_with_quali}

    missing = races_with_results - races_with_quali
    if not missing:
        logger.info("No qualifying gaps to backfill")
        return

    total = 0
    for race_id in sorted(missing):
        results = (
            db.query(RaceResult)
            .filter(RaceResult.race_id == race_id, RaceResult.grid.isnot(None), RaceResult.grid > 0)
            .all()
        )
        for r in results:
            quali = QualifyingResult(
                id=f"{race_id}_Q_{r.driver_id}",
                race_id=race_id,
                driver_id=r.driver_id,
                constructor_id=r.constructor_id,
                number=r.number,
                position=r.grid,
            )
            db.merge(quali)
            total += 1
        db.commit()

    logger.info(f"Backfilled {total} qualifying results for {len(missing)} races")


def _should_run(targets: set[str] | None, key: str) -> bool:
    return targets is None or key in targets


def run_full_load(targets: set[str] | None = None) -> None:
    """Run the data load. If targets is None, run everything."""
    db: Session = SessionLocal()
    start = time.time()

    label = "full data load" if targets is None else f"selective load ({', '.join(sorted(targets))})"

    try:
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
            RaceIngestor(db).ingest()

        if _should_run(targets, "layouts"):
            logger.info("\n--- Circuit layouts ---")
            CircuitLayoutIngestor(db).ingest()

        if _should_run(targets, "images"):
            logger.info("\n--- Images (headshots + colors) ---")
            DriverHeadshotIngestor(db).ingest()
            ConstructorColorIngestor(db).ingest()

        if _should_run(targets, "results"):
            logger.info("\n--- Race results ---")
            RaceResultIngestor(db).ingest()

        if _should_run(targets, "qualifying"):
            logger.info("\n--- Qualifying ---")
            QualifyingIngestor(db).ingest()

        if _should_run(targets, "sprints"):
            logger.info("\n--- Sprint results ---")
            SprintResultIngestor(db).ingest()

        if _should_run(targets, "standings"):
            logger.info("\n--- Standings ---")
            StandingsIngestor(db).ingest()

        if _should_run(targets, "pitstops"):
            logger.info("\n--- Pit stops ---")
            PitStopIngestor(db).ingest()

        if _should_run(targets, "backfill-qualifying"):
            logger.info("\n--- Backfill qualifying ---")
            backfill_qualifying(db)

        if _should_run(targets, "postprocess"):
            logger.info("\n--- Post-processing ---")
            backfill_driver_codes(db)
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
