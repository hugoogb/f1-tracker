"""Run the data load: every ingestor, or the ones named by `--<target>` flags.

It touches the database only. `--restore` first loads docker/backups/latest.sql.gz
over it (so a long load starts from the seed instead of from nothing) and
`--backup` dumps it there afterwards; both are opt-in, because a run that only
rebuilds one table has no business replacing the database or the seed copy.
"""

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

from src.cli import parse_year_range, setup_logging  # noqa: E402
from src.ingestion.base import set_interrupted  # noqa: E402
from src.ingestion.fastf1_sessions import configure_logging  # noqa: E402
from src.ingestion.full_load import run_full_load  # noqa: E402

logger = logging.getLogger(__name__)

SCRIPTS_DIR = Path(__file__).parent.parent.parent / "scripts"
BACKUP_SCRIPT = SCRIPTS_DIR / "db-backup.sh"
RESTORE_SCRIPT = SCRIPTS_DIR / "db-restore.sh"
BACKUP_FILE = Path(__file__).parent.parent.parent / "docker" / "backups" / "latest.sql.gz"

# The restore/backup helpers shell out to the database *container*. Which one
# they pick is theirs to decide (scripts/lib/db.sh reads STACK_NAME/DB_CONTAINER
# from the environment or .env). Both are skipped when there is no Docker CLI,
# as in the ingest container. DB_CONTAINER is read here only to name it in the log.
DB_CONTAINER = os.environ.get("DB_CONTAINER", f"{os.environ.get('STACK_NAME', 'f1-tracker')}-db")


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

    # Delegated to db-restore.sh rather than piped into psql here. Backups are
    # full dumps now — schema, data, the Alembic stamp and the materialized
    # views — so the order of restore and `alembic upgrade head` depends on the
    # dump's flavour, and that decision belongs in one place.
    logger.info(f"Restoring from backup: {BACKUP_FILE} into {DB_CONTAINER}")
    result = subprocess.run(
        ["bash", str(RESTORE_SCRIPT), str(BACKUP_FILE)],
        env={**os.environ, "FORCE": "1"},
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        # Non-fatal, and safely so: db-restore.sh loads the dump with
        # --single-transaction, so a failure leaves the database exactly as it
        # was rather than half-replaced, and the ingest below upserts either
        # way.
        logger.warning(f"Restore skipped — continuing with the ingest: {result.stderr.strip()}")
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
    logger.warning(f"{sig_name} received, finishing the current operation...")


INGESTOR_FLAGS = [
    "base",
    "layouts",
    "colors",
    "lineages",
    "results",
    "qualifying",
    "sprints",
    "standings",
    "pitstops",
    "laptimes",
    "qualifying-sectors",
    "postprocess",
]


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="F1 Tracker data ingestion")
    for flag in INGESTOR_FLAGS:
        parser.add_argument(f"--{flag}", action="store_true", help=f"Run {flag} ingestion")
    parser.add_argument(
        "--restore",
        action="store_true",
        help="First restore docker/backups/latest.sql.gz over the local database",
    )
    parser.add_argument(
        "--backup",
        action="store_true",
        help="Afterwards dump the local database to docker/backups/latest.sql.gz",
    )
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
    parser.add_argument(
        "--refresh-positions",
        action="store_true",
        help="Re-fetch lap data stored before per-lap positions were kept",
    )
    return parser.parse_args(argv)


def main() -> None:
    setup_logging()
    configure_logging()

    args = parse_args()
    signal.signal(signal.SIGTERM, _handle_signal)

    # Build targets: None = run all, set = run only selected
    selected = {f for f in INGESTOR_FLAGS if getattr(args, f.replace("-", "_"))}
    targets = selected or None

    year_range = parse_year_range(args.year_range, current_year=args.current_year)

    # 1. Start from the seed rather than from nothing, when asked
    if args.restore:
        restore_backup()

    # 2. Run the load
    try:
        run_full_load(targets, year_range=year_range, refresh_positions=args.refresh_positions)
    except (InterruptedError, KeyboardInterrupt):
        logger.warning("Seed interrupted by user")

    # 3. Backup (even on interrupt, to preserve progress), when asked
    if args.backup:
        create_backup()


if __name__ == "__main__":
    main()
