"""Report which races still need Fast-F1 data, as JSON on stdout.

The database knows what is missing; the host that can reach Fast-F1 does not.
This bridges the two: it runs on the box (against PostgreSQL, no network) and
prints a target list that `scripts/fastf1_fetch.py` consumes elsewhere.

    {"generated_at": ..., "count": 2, "targets": [
      {"race_id": "2025-17", "year": 2025, "round": 17,
       "date": "2025-09-07", "need": ["laps", "quali_sectors"]}]}

Everything except the JSON goes to stderr, so callers can redirect stdout
straight into a file.

Usage:
    uv run python scripts/fastf1_status.py [--need laps,quali_sectors]
                                           [--year-range 2018-2020 | --current-year]
                                           [--limit N] [--oldest-first]
"""

import argparse
import json
import sys
from datetime import UTC, date, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select  # noqa: E402

from src.db.database import SessionLocal  # noqa: E402
from src.db.models import Race  # noqa: E402
from src.ingestion.fastf1_payload import KIND_LAPS, KIND_QUALI_SECTORS, KINDS  # noqa: E402
from src.ingestion.lap_times import (  # noqa: E402
    FIRST_LAP_DATA_YEAR,
    races_with_lap_positions,
    races_with_lap_times,
)
from src.ingestion.qualifying_sectors import (  # noqa: E402
    races_with_quali_results,
    races_with_quali_sectors,
)


def parse_year_range(value: str | None) -> tuple[int, int] | None:
    """Parse '2008-2015' or '2020' into (start, end)."""
    if not value:
        return None
    if "-" in value:
        start, end = value.split("-", 1)
        return (int(start), int(end))
    year = int(value)
    return (year, year)


def find_targets(
    db,
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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Races still missing Fast-F1 data")
    parser.add_argument(
        "--need",
        default=",".join(KINDS),
        help=f"Comma-separated data kinds to look for (default: {','.join(KINDS)})",
    )
    parser.add_argument("--year-range", type=str, default=None, help="e.g. 2018-2020 or 2024")
    parser.add_argument("--current-year", action="store_true", help="Limit to the current year")
    parser.add_argument("--limit", type=int, default=None, help="Cap the number of targets")
    parser.add_argument(
        "--oldest-first",
        action="store_true",
        help="Backfill order; the default takes the most recent races first",
    )
    parser.add_argument(
        "--refresh-positions",
        action="store_true",
        help="Also re-fetch races whose laps were stored without per-lap positions",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    need = {k.strip() for k in args.need.split(",") if k.strip()}
    unknown = need - set(KINDS)
    if unknown:
        print(f"Unknown --need value(s): {', '.join(sorted(unknown))}", file=sys.stderr)
        return 2

    year_range = parse_year_range(args.year_range)
    if args.current_year and not year_range:
        current = date.today().year
        year_range = (current, current)

    db = SessionLocal()
    try:
        targets = find_targets(
            db,
            need=need,
            year_range=year_range,
            limit=args.limit,
            oldest_first=args.oldest_first,
            refresh_positions=args.refresh_positions,
        )
    finally:
        db.close()

    print(f"{len(targets)} race(s) missing Fast-F1 data", file=sys.stderr)
    json.dump(
        {
            "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
            "count": len(targets),
            "targets": targets,
        },
        sys.stdout,
    )
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
