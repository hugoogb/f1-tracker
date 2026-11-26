"""Ingest lap time data from Fast-F1 (2018+ only).

`write_lap_rows` is the one writer, fed by `LapTimeIngestor`
(`fastf1_ingest.py`, fetch and write in one process) and by
`scripts/fastf1_import.py` (a payload built off-box).
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.db.models import LapTime

FIRST_LAP_DATA_YEAR = 2018


def races_with_lap_times(db: Session) -> set[str]:
    """Ids of races that already have lap times stored."""
    return set(db.execute(select(LapTime.race_id).group_by(LapTime.race_id)).scalars().all())


def races_with_lap_positions(db: Session) -> set[str]:
    """Ids of races whose lap rows carry Fast-F1's per-lap position.

    Races ingested before the position was stored have lap times but no
    positions, and only a re-fetch of the session can fill them in.

    One non-null row is enough to count the race as done. A session Fast-F1 has
    no positions for *at all* therefore stays outstanding and is offered again
    by every `--refresh-positions` run — wasteful rather than wrong, and only on
    an opt-in backfill, so it is not worth a column to remember the attempt.
    """
    return set(
        db.execute(
            select(LapTime.race_id).where(LapTime.position.isnot(None)).group_by(LapTime.race_id)
        )
        .scalars()
        .all()
    )


def write_lap_rows(
    db: Session,
    race_id: str,
    rows: list[dict],
    abbr_to_id: dict[str, str],
) -> int:
    """Merge extracted lap rows into `lap_times`. The caller commits.

    Rows are keyed by driver abbreviation (see `fastf1_sessions`); anything
    whose abbreviation is not among this race's entrants is skipped, which is
    how a code reused across eras stays harmless.
    """
    written = 0
    for row in rows:
        driver_id = abbr_to_id.get(str(row.get("driver") or ""))
        if not driver_id:
            continue
        lap_num = row.get("lap_number")
        if lap_num is None:
            continue
        lap_num = int(lap_num)

        db.merge(
            LapTime(
                id=f"{race_id}_L_{driver_id}_{lap_num}",
                race_id=race_id,
                driver_id=driver_id,
                lap_number=lap_num,
                position=row.get("position"),
                time_millis=row.get("time_millis"),
                sector1_ms=row.get("sector1_ms"),
                sector2_ms=row.get("sector2_ms"),
                sector3_ms=row.get("sector3_ms"),
                compound=row.get("compound"),
                stint=row.get("stint"),
                tyre_life=row.get("tyre_life"),
            )
        )
        written += 1
    return written
