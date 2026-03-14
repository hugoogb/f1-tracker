"""Run the full initial data load."""

import argparse
import logging
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


def restore_backup() -> None:
    """Restore from latest backup if it exists."""
    if not BACKUP_FILE.exists():
        logger.info("No backup found, starting fresh")
        return

    logger.info(f"Restoring from backup: {BACKUP_FILE}")
    result = subprocess.run(
        [
            "bash",
            "-c",
            f'gunzip -c "{BACKUP_FILE}" | docker exec -i docker-db-1 psql -U f1tracker -d f1tracker --single-transaction -q',
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
    "base", "layouts", "results", "qualifying", "sprints", "standings",
    "pitstops", "backfill-qualifying", "postprocess",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="F1 Tracker data ingestion")
    for flag in INGESTOR_FLAGS:
        parser.add_argument(f"--{flag}", action="store_true", help=f"Run {flag} ingestion")
    parser.add_argument("--no-restore", action="store_true", help="Skip backup restore")
    parser.add_argument("--no-backup", action="store_true", help="Skip backup after completion")
    return parser.parse_args()


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

    # 1. Restore existing backup so we don't re-fetch data we already have
    if not args.no_restore:
        restore_backup()

    # 2. Run the load
    try:
        run_full_load(targets)
    except (InterruptedError, KeyboardInterrupt):
        logger.warning("Seed interrupted by user")

    # 3. Backup (even on interrupt, to preserve progress)
    if not args.no_backup:
        create_backup()
