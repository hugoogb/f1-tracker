"""Which races still need Fast-F1 data, read off the database.

Pure DB logic, no network and no argparse, so it has three callers that must
never disagree: `scripts/fastf1_status.py` (what `pnpm fastf1` fetches next),
`scripts/fastf1_fetch.py`'s target list, and `/api/ops/status` (what the status
page reports as outstanding). A backlog number on a page that did not come from
this function would drift away from the one the sync script acts on, and the
page would be quietly lying.

It lives under `src/` rather than in the script because `scripts/` is a CLI
entry point — importing one pulls in its argparse and its `sys.path` surgery,
which the API has no business doing.
"""

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.db.models import Race
from src.ingestion.fastf1_payload import KIND_LAPS, KIND_QUALI_SECTORS
from src.ingestion.lap_times import (
    FIRST_LAP_DATA_YEAR,
    races_with_lap_positions,
    races_with_lap_times,
)
from src.ingestion.qualifying_sectors import (
    races_with_quali_results,
    races_with_quali_sectors,
)


def find_targets(
    db: Session,
    need: set[str],
    year_range: tuple[int, int] | None = None,
    limit: int | None = None,
    oldest_first: bool = False,
    refresh_positions: bool = False,
) -> list[dict]:
    """List races missing the requested Fast-F1 data, newest first by default.

    `refresh_positions` also claims races whose lap rows predate storing
    Fast-F1's per-lap position. Their laps are already loaded, so nothing else
    would ever ask for them again, and only re-fetching the session fills the
    column in. Off by default: it is a one-off backfill at ~45s a session, and
    the weekly run has no business dragging it along.
    """
    have_laps = races_with_lap_times(db) if KIND_LAPS in need else set()
    if refresh_positions and KIND_LAPS in need:
        have_laps &= races_with_lap_positions(db)
    have_sectors = races_with_quali_sectors(db) if KIND_QUALI_SECTORS in need else set()
    have_quali = races_with_quali_results(db) if KIND_QUALI_SECTORS in need else set()

    min_year = max(FIRST_LAP_DATA_YEAR, year_range[0]) if year_range else FIRST_LAP_DATA_YEAR
    query = select(Race).where(Race.season_year >= min_year)
    if year_range:
        query = query.where(Race.season_year <= year_range[1])
    query = query.order_by(Race.season_year.desc(), Race.round.desc())
    if oldest_first:
        query = query.order_by(None).order_by(Race.season_year, Race.round)

    today = date.today()
    targets: list[dict] = []
    for race in db.execute(query).scalars():
        # A race that has not happened yet has no session to fetch.
        if race.date and race.date > today:
            continue

        missing = []
        if KIND_LAPS in need and race.id not in have_laps:
            missing.append(KIND_LAPS)
        # Sector times fill in existing qualifying rows, so a race without them
        # has nothing to attach to.
        if KIND_QUALI_SECTORS in need and race.id in have_quali and race.id not in have_sectors:
            missing.append(KIND_QUALI_SECTORS)
        if not missing:
            continue

        targets.append(
            {
                "race_id": race.id,
                "year": race.season_year,
                "round": race.round,
                "date": race.date.isoformat() if race.date else None,
                "need": missing,
            }
        )
        if limit is not None and len(targets) >= limit:
            break

    return targets
