"""Ingest qualifying sector times from Fast-F1 (2018+ only).

`write_quali_sectors` is the one writer, fed by `QualifyingSectorIngestor`
(`fastf1_ingest.py`, fetch and write in one process) and by
`scripts/fastf1_import.py` (a payload built off-box).
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.db.models import QualifyingResult

# Qualifying segment -> the QualifyingResult columns it fills.
_SEGMENT_COLUMNS = {
    "Q1": ("q1_s1_ms", "q1_s2_ms", "q1_s3_ms"),
    "Q2": ("q2_s1_ms", "q2_s2_ms", "q2_s3_ms"),
    "Q3": ("q3_s1_ms", "q3_s2_ms", "q3_s3_ms"),
}


def races_with_quali_sectors(db: Session) -> set[str]:
    """Ids of races whose qualifying results already carry sector times."""
    return set(
        db.execute(
            select(QualifyingResult.race_id)
            .where(QualifyingResult.q1_s1_ms.isnot(None))
            .group_by(QualifyingResult.race_id)
        )
        .scalars()
        .all()
    )


def races_with_quali_results(db: Session) -> set[str]:
    """Ids of races that have qualifying results at all.

    Sector times update existing rows, so a race without them has nothing to
    attach to and is not worth fetching.
    """
    return set(
        db.execute(select(QualifyingResult.race_id).group_by(QualifyingResult.race_id))
        .scalars()
        .all()
    )


def write_quali_sectors(
    db: Session,
    race_id: str,
    bests: dict[str, dict],
    abbr_to_id: dict[str, str],
) -> int:
    """Fill sector columns on this race's qualifying rows. The caller commits.

    `bests` is `{abbreviation: {"Q1": {"s1_ms": ..., "lap_ms": ...}, ...}}` as
    produced by `fastf1_sessions.extract_qualifying_bests`.
    """
    quali_by_driver = {
        q.driver_id: q
        for q in db.execute(select(QualifyingResult).where(QualifyingResult.race_id == race_id))
        .scalars()
        .all()
    }
    if not quali_by_driver:
        return 0

    updated = 0
    for abbr, segments in bests.items():
        driver_id = abbr_to_id.get(str(abbr))
        if not driver_id:
            continue
        quali = quali_by_driver.get(driver_id)
        if not quali:
            continue

        touched = False
        for segment, (s1_col, s2_col, s3_col) in _SEGMENT_COLUMNS.items():
            best = segments.get(segment)
            if not best:
                continue
            setattr(quali, s1_col, best.get("s1_ms"))
            setattr(quali, s2_col, best.get("s2_ms"))
            setattr(quali, s3_col, best.get("s3_ms"))
            touched = True

        if touched:
            updated += 1
    return updated
