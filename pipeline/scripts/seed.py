"""Run the full initial data load."""

import argparse
import logging
import os
import shutil
import signal
import subprocess
import sys
from pathlib import Path

# Add the pipeline directory to the path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.ingestion.base import set_interrupted  # noqa: E402
from src.ingestion.full_load import run_full_load  # noqa: E402

logger = logging.getLogger(__name__)

SCRIPTS_DIR = Path(__file__).parent.parent.parent / "scripts"
BACKUP_SCRIPT = SCRIPTS_DIR / "db-backup.sh"
RESTORE_SCRIPT = SCRIPTS_DIR / "db-restore.sh"
BACKUP_FILE = Path(__file__).parent.parent.parent / "docker" / "backups" / "latest.sql.gz"

# The restore/backup helpers shell out to the database *container*. Which one is
# configurable so this works against local dev and the VPS stack alike, and it is
# skipped entirely when there is no Docker CLI — e.g. when seed.py runs inside the
# ingest container, which passes --no-restore --no-backup anyway.
STACK_NAME = os.environ.get("STACK_NAME", "f1-tracker")
DB_CONTAINER = os.environ.get("DB_CONTAINER", f"{STACK_NAME}-db")
POSTGRES_USER = os.environ.get("POSTGRES_USER", "f1tracker")
POSTGRES_DB = os.environ.get("POSTGRES_DB", "f1tracker")


def _docker_available() -> bool:
    return shutil.which("docker") is not None


def restore_backup() -> None:
    """Restore from latest backup if it exists."""
    if not BACKUP_FILE.exists():
        logger.info("No backup found, starting fresh")
        return

    if not _docker_available():
        logger.info("Docker CLI not available, skipping backup restore")
        return

    logger.info(f"Restoring from backup: {BACKUP_FILE} into {DB_CONTAINER}")
    result = subprocess.run(
        [
            "bash",
            "-c",
            f'gunzip -c "{BACKUP_FILE}" | docker exec -i {DB_CONTAINER} '
            f"psql -U {POSTGRES_USER} -d {POSTGRES_DB} --single-transaction -q",
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        logger.warning(
            f"Restore failed (may be OK if data already exists): {result.stderr.strip()}"
        )
    else:
        logger.info("Backup restored successfully")


def create_backup() -> None:
    """Create a backup after seed completes."""
    if not BACKUP_SCRIPT.exists():
        logger.warning(f"Backup script not found: {BACKUP_SCRIPT}")
        return

    if not _docker_available():
        logger.info("Docker CLI not available, skipping backup")
        return

    logger.info("Creating backup...")
    result = subprocess.run(
        ["bash", str(BACKUP_SCRIPT)],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        logger.warning(f"Backup failed: {result.stderr.strip()}")
    else:
        logger.info(result.stdout.strip())


def _handle_signal(signum, frame):
    """Signal handler for graceful shutdown."""
    set_interrupted()
    sig_name = signal.Signals(signum).name
    logger.warning(f"{sig_name} received, finishing current operation then backing up...")


INGESTOR_FLAGS = [
    "base",
    "layouts",
    "images",
    "logos",
    "results",
    "qualifying",
    "sprints",
    "standings",
    "pitstops",
    "laptimes",
    "qualifying-sectors",
    "backfill-qualifying",
    "postprocess",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="F1 Tracker data ingestion")
    for flag in INGESTOR_FLAGS:
        parser.add_argument(f"--{flag}", action="store_true", help=f"Run {flag} ingestion")
    parser.add_argument("--no-restore", action="store_true", help="Skip backup restore")
    parser.add_argument("--no-backup", action="store_true", help="Skip backup after completion")
    parser.add_argument(
        "--year-range",
        type=str,
        default=None,
        help="Limit ingestion to a year range, e.g. 2008-2015 or 2020",
    )
    parser.add_argument(
        "--current-year",
        action="store_true",
        help="Limit ingestion to current year only",
    )
    return parser.parse_args()


def parse_year_range(year_range: str | None) -> tuple[int, int] | None:
    """Parse a year range string like '2008-2015' or '2020' into (start, end) tuple."""
    if not year_range:
        return None
    if "-" in year_range:
        parts = year_range.split("-", 1)
        return (int(parts[0]), int(parts[1]))
    year = int(year_range)
    return (year, year)


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)-5s %(message)s",
        datefmt="%H:%M:%S",
    )
    logging.getLogger("fastf1").setLevel(logging.WARNING)

    args = parse_args()
    signal.signal(signal.SIGTERM, _handle_signal)

    # Build targets: None = run all, set = run only selected
    selected = {f for f in INGESTOR_FLAGS if getattr(args, f.replace("-", "_"))}
    targets = selected or None

    if args.current_year and not args.year_range:
        from datetime import date

        current = date.today().year
        year_range = (current, current)
    else:
        year_range = parse_year_range(args.year_range)

    # 1. Restore existing backup so we don't re-fetch data we already have
    if not args.no_restore:
        restore_backup()

    # 2. Run the load
    try:
        run_full_load(targets, year_range=year_range)
    except (InterruptedError, KeyboardInterrupt):
        logger.warning("Seed interrupted by user")

    # 3. Backup (even on interrupt, to preserve progress)
    if not args.no_backup:
        create_backup()
