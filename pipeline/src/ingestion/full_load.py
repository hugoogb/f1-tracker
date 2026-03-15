"""Orchestrates a complete data load from Fast-F1 into PostgreSQL."""

import logging
import time

from sqlalchemy import text
from sqlalchemy.orm import Session

from src.db.database import SessionLocal
from src.db.models import Driver, QualifyingResult, Race, RaceResult
from src.ingestion.circuit_layouts import CircuitLayoutIngestor
from src.ingestion.drivers import ConstructorIngestor, DriverIngestor, StatusIngestor
from src.ingestion.images import (
    ConstructorColorIngestor,
    ConstructorLogoIngestor,
    DriverHeadshotIngestor,
    WikidataHeadshotIngestor,
    WikimediaLogoIngestor,
)
from src.ingestion.lap_times import LapTimeIngestor
from src.ingestion.pit_stops import PitStopIngestor
from src.ingestion.qualifying_sectors import QualifyingSectorIngestor
from src.ingestion.races import RaceIngestor
from src.ingestion.results import QualifyingIngestor, RaceResultIngestor, SprintResultIngestor
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


def _parse_lap_time_ms(time_str: str) -> int | None:
    """Parse a lap time string like '1:23.456' to milliseconds."""
    try:
        if ":" in time_str:
            mins, secs = time_str.split(":", 1)
            return int((int(mins) * 60 + float(secs)) * 1000)
        return int(float(time_str) * 1000)
    except (ValueError, TypeError):
        return None


def compute_race_aggregates(db: Session) -> None:
    """Compute and store fastest lap + fastest qualifying sectors on Race rows."""
    logger.info("Computing race aggregates (fastest lap + qualifying sectors)...")

    races = db.query(Race).all()
    updated = 0

    for race in races:
        changed = False

        # --- Fastest lap ---
        results = (
            db.query(RaceResult)
            .filter(RaceResult.race_id == race.id)
            .all()
        )
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
        qualis = (
            db.query(QualifyingResult)
            .filter(QualifyingResult.race_id == race.id)
            .all()
        )
        for sector_idx, (s1_attr, s2_attr, s3_attr) in enumerate([
            ("q1_s1_ms", "q2_s1_ms", "q3_s1_ms"),
            ("q1_s2_ms", "q2_s2_ms", "q3_s2_ms"),
            ("q1_s3_ms", "q2_s3_ms", "q3_s3_ms"),
        ], start=1):
            best_sector_ms = None
            best_sector_driver_id = None
            for q in qualis:
                for attr in (s1_attr, s2_attr, s3_attr):
                    val = getattr(q, attr, None)
                    if val is not None and (
                        best_sector_ms is None or val < best_sector_ms
                    ):
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


def run_full_load(
    targets: set[str] | None = None,
    year_range: tuple[int, int] | None = None,
) -> None:
    """Run the data load. If targets is None, run everything.
    If year_range is provided, only ingest data for seasons in [start, end].
    """
    db: Session = SessionLocal()
    start = time.time()

    label = "full data load" if targets is None else f"selective load ({', '.join(sorted(targets))})"
    if year_range:
        label += f" [{year_range[0]}-{year_range[1]}]"

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
            WikidataHeadshotIngestor(db).ingest()
            ConstructorColorIngestor(db).ingest()

        if _should_run(targets, "logos"):
            logger.info("\n--- Constructor logos ---")
            ConstructorLogoIngestor(db).ingest()
            WikimediaLogoIngestor(db).ingest()

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
            LapTimeIngestor(db).ingest(year_range=year_range)

        if _should_run(targets, "qualifying-sectors"):
            logger.info("\n--- Qualifying sectors ---")
            QualifyingSectorIngestor(db).ingest(year_range=year_range)

        if _should_run(targets, "backfill-qualifying"):
            logger.info("\n--- Backfill qualifying ---")
            backfill_qualifying(db)

        if _should_run(targets, "postprocess"):
            logger.info("\n--- Post-processing ---")
            backfill_driver_codes(db)
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
