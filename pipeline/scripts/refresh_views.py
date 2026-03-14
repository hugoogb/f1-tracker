"""Refresh materialized views."""

import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.db.database import SessionLocal  # noqa: E402
from src.ingestion.full_load import refresh_materialized_views  # noqa: E402

if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)-5s %(message)s",
        datefmt="%H:%M:%S",
    )
    db = SessionLocal()
    try:
        refresh_materialized_views(db)
    finally:
        db.close()
