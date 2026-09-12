"""Load a Fast-F1 payload into PostgreSQL. No network required.

The other half of `scripts/fastf1_fetch.py`: the payload was fetched on a host
Fast-F1 will still serve, and this loads it on the host that owns the database
— which is exactly the split Formula 1's IP block forces on us.

It resolves everything against the live database rather than trusting the
payload: races by id (falling back to year/round) and drivers by the
three-letter code of that race's entrants, so a stale or hand-edited payload
cannot attach laps to the wrong driver.

Writes are `merge`d per session and committed per session, so a re-run is a
no-op and an interrupted import keeps what it had already loaded.

Usage:
    uv run python scripts/fastf1_import.py --payload payload.ndjson.gz
    ... | uv run python scripts/fastf1_import.py          # payload on stdin
"""

import argparse
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select  # noqa: E402

from src.db.database import SessionLocal  # noqa: E402
from src.db.models import Race  # noqa: E402
from src.ingestion.base import build_abbr_to_driver_id, race_entrant_codes  # noqa: E402
from src.ingestion.fastf1_payload import (  # noqa: E402
    KIND_LAPS,
    PayloadError,
    SessionRecord,
    read_payload,
)
from src.ingestion.full_load import compute_race_aggregates  # noqa: E402
from src.ingestion.lap_times import write_lap_rows  # noqa: E402
from src.ingestion.qualifying_sectors import write_quali_sectors  # noqa: E402

logger = logging.getLogger("fastf1_import")


def resolve_race(db, record: SessionRecord) -> Race | None:
    """Find the race a record belongs to: by id when it carries one, else by round."""
    if record.race_id:
        race = db.get(Race, record.race_id)
        if race:
            return race
        logger.warning(
            f"{record.label}: race id {record.race_id} not found, falling back to year/round"
        )
    return db.execute(
        select(Race).where(Race.season_year == record.year, Race.round == record.round)
    ).scalar_one_or_none()


def import_record(db, record: SessionRecord) -> tuple[str | None, int]:
    """Load one session. Returns `(race id written to, rows written)`."""
    race = resolve_race(db, record)
    if race is None:
        logger.warning(f"{record.label}: no matching race in the database — skipped")
        return None, 0

    abbr_to_id = build_abbr_to_driver_id(record.abbrs, race_entrant_codes(db, race.id))
    if not abbr_to_id:
        logger.warning(f"{record.label}: no driver mapping for {race.id} — skipped")
        return None, 0

    if record.kind == KIND_LAPS:
        written = write_lap_rows(db, race.id, record.rows, abbr_to_id)
        noun = "lap times"
    else:
        written = write_quali_sectors(db, race.id, record.bests, abbr_to_id)
        noun = "qualifying results"

    db.commit()
    logger.info(f"{record.label}: {written} {noun} written ({race.id})")
    return race.id, written


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Load a Fast-F1 payload into PostgreSQL")
    parser.add_argument(
        "--payload",
        type=Path,
        default=None,
        help="Payload path; omitted or '-' reads stdin. Gzip is detected automatically.",
    )
    parser.add_argument(
        "--no-postprocess",
        action="store_true",
        help="Skip recomputing race aggregates (fastest lap, best qualifying sectors)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse and report the payload without writing anything",
    )
    return parser.parse_args()


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)-5s %(message)s",
        datefmt="%H:%M:%S",
    )

    args = parse_args()

    db = SessionLocal()
    imported = 0
    skipped = 0
    written_total = 0
    touched: set[str] = set()

    try:
        for record in read_payload(args.payload):
            if args.dry_run:
                size = len(record.rows) or len(record.bests)
                logger.info(f"{record.label}: {size} record(s) (dry run)")
                imported += 1
                continue

            try:
                race_id, written = import_record(db, record)
            except Exception as e:
                db.rollback()
                logger.error(f"{record.label}: ERROR - {e}")
                skipped += 1
                continue

            if race_id:
                imported += 1
                written_total += written
                touched.add(race_id)
            else:
                skipped += 1

        if touched and not args.no_postprocess:
            compute_race_aggregates(db, race_ids=touched)

    except PayloadError as e:
        logger.error(f"Bad payload: {e}")
        return 1
    except KeyboardInterrupt:
        logger.warning("Interrupted — sessions already committed are kept")
        return 1
    finally:
        db.close()

    logger.info(
        f"Imported {imported} session(s), {written_total} row(s), "
        f"{len(touched)} race(s) touched, {skipped} skipped"
    )
    # An empty or entirely unusable payload should not look like a success.
    return 0 if imported or not skipped else 1


if __name__ == "__main__":
    raise SystemExit(main())
