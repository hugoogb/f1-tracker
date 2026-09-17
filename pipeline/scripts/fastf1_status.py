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

from src.db.database import SessionLocal  # noqa: E402
from src.ingestion.fastf1_payload import KINDS  # noqa: E402

# The backlog query itself lives under src/ so /api/ops/status can share it —
# the status page and this script must never disagree about what is missing.
from src.ingestion.fastf1_targets import find_targets  # noqa: E402


def parse_year_range(value: str | None) -> tuple[int, int] | None:
    """Parse '2008-2015' or '2020' into (start, end)."""
    if not value:
        return None
    if "-" in value:
        start, end = value.split("-", 1)
        return (int(start), int(end))
    year = int(value)
    return (year, year)


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
