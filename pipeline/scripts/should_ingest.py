"""Calendar gate for the scheduled ingest workflow.

Decides whether a race happened recently enough to justify an ingest run, so the
weekly run doesn't waste itself (or pull partial data) on off-weekends.

Prints the decision. Exit code is 0 either way unless ``--exit-code`` is passed,
which makes the decision the exit status (0 = ingest, 1 = skip) so a shell
caller (`scripts/vps-ingest.sh`) can gate on it:

    python scripts/should_ingest.py --days 3 --exit-code && ./run-ingest

Fails OPEN: on any error loading the f1db release it returns ``true`` so a real
race weekend is never silently skipped.

Usage:
    uv run python scripts/should_ingest.py [--days N] [--exit-code]
"""

import argparse
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.ingestion import f1db  # noqa: E402


def decide(days: int) -> tuple[bool, str]:
    """Whether to ingest, and why."""
    today = date.today()

    try:
        data = f1db.load()
    except Exception as e:  # noqa: BLE001 — fail open on any fetch error
        return True, f"could not load f1db ({e}); failing open"

    # Find the most recent race date this season that is on or before today.
    past_dates = []
    for race in data.races:
        if int(race.get("year", 0)) != today.year:
            continue
        raw = race.get("date")
        if not raw:
            continue
        try:
            d = date.fromisoformat(str(raw))
        except ValueError:
            continue
        if d <= today:
            past_dates.append(d)

    if not past_dates:
        return False, f"no completed races yet in {today.year}"

    last_race = max(past_dates)
    days_since = (today - last_race).days
    if days_since <= days:
        return True, f"last race {last_race} was {days_since} day(s) ago"
    return False, f"last race {last_race} was {days_since} day(s) ago (> {days})"


def main() -> int:
    parser = argparse.ArgumentParser(description="Decide whether to run an ingest")
    parser.add_argument(
        "--days",
        type=int,
        default=3,
        help="A race counts as recent if it ran within this many days (default: 3)",
    )
    parser.add_argument(
        "--exit-code",
        action="store_true",
        help="Exit 0 to ingest, 1 to skip (for shell callers)",
    )
    args = parser.parse_args()

    should, reason = decide(args.days)
    print(f"should_ingest={str(should).lower()} — {reason}")
    return 1 if args.exit_code and not should else 0


if __name__ == "__main__":
    sys.exit(main())
