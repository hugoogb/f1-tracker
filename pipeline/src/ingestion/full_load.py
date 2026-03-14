"""Orchestrates a complete data load from Fast-F1 into PostgreSQL."""

import logging
import time

from sqlalchemy import text
from sqlalchemy.orm import Session

from src.db.database import SessionLocal
from src.db.models import Driver, RaceResult
from src.ingestion.drivers import ConstructorIngestor, DriverIngestor, StatusIngestor
from src.ingestion.pit_stops import PitStopIngestor
from src.ingestion.races import RaceIngestor
from src.ingestion.results import QualifyingIngestor, RaceResultIngestor, SprintResultIngestor
from src.ingestion.seasons import CircuitIngestor, SeasonIngestor
from src.ingestion.standings import StandingsIngestor

logger = logging.getLogger(__name__)


def backfill_driver_codes(db: Session) -> None:
    """Backfill driver number and code from their most recent race result."""
    logger.info("Backfilling driver numbers and codes from race results...")

    # Get the most recent race result for each driver to extract number/code
    results = (
        db.query(RaceResult)
        .order_by(RaceResult.race_id.desc())
        .all()
    )

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
    db.execute(text(
        "DROP MATERIALIZED VIEW IF EXISTS driver_career_stats CASCADE"
    ))
    db.execute(text(
        "DROP MATERIALIZED VIEW IF EXISTS constructor_career_stats CASCADE"
    ))

    # Season champions: position=1 in final round standings
    db.execute(text("""
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
    """))

    # Driver career stats
    db.execute(text("""
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
    """))

    # Constructor career stats
    db.execute(text("""
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
    """))

    db.commit()
    logger.info("Materialized views created")


def run_full_load() -> None:
    """Run the complete initial data load."""
    db: Session = SessionLocal()
    start = time.time()

    try:
        logger.info("=" * 60)
        logger.info("Starting full data load...")
        logger.info("=" * 60)

        # 1. Independent entities (no FK dependencies)
        logger.info("\n--- Phase 1: Independent entities ---")
        SeasonIngestor(db).ingest()
        CircuitIngestor(db).ingest()
        StatusIngestor(db).ingest()
        DriverIngestor(db).ingest()
        ConstructorIngestor(db).ingest()

        # 2. Races (depends on seasons + circuits)
        logger.info("\n--- Phase 2: Races ---")
        RaceIngestor(db).ingest()

        # 3. Per-race data (depends on races + drivers + constructors)
        logger.info("\n--- Phase 3: Race data ---")
        RaceResultIngestor(db).ingest()
        QualifyingIngestor(db).ingest()
        SprintResultIngestor(db).ingest()

        # 4. Standings (depends on races + drivers + constructors)
        logger.info("\n--- Phase 4: Standings ---")
        StandingsIngestor(db).ingest()

        # 5. Pit stops (depends on races + drivers, 2012+ only)
        logger.info("\n--- Phase 5: Pit stops ---")
        PitStopIngestor(db).ingest()

        # 6. Post-processing
        logger.info("\n--- Phase 6: Post-processing ---")
        backfill_driver_codes(db)
        refresh_materialized_views(db)

        elapsed = time.time() - start
        logger.info("=" * 60)
        logger.info(f"Full data load complete in {elapsed:.1f}s")
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
