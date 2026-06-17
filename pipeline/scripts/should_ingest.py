"""Calendar gate for the scheduled ingest workflow.

Decides whether a race happened recently enough to justify an ingest run, so the
weekly cron doesn't waste runs (or pull partial data) on off-weekends.

Exit code 0 always. Writes ``should_ingest=true|false`` to $GITHUB_OUTPUT when
running in GitHub Actions, and also prints the decision.

Fails OPEN: on any error fetching the schedule it returns ``true`` so a real
race weekend is never silently skipped.

Usage:
    uv run python scripts/should_ingest.py [--days N]

Env:
    FORCE_INGEST=true   Force a positive decision (used by manual dispatch).
"""

import argparse
import os
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pandas as pd  # noqa: E402


def _emit(should: bool, reason: str) -> None:
    print(f"should_ingest={str(should).lower()} — {reason}")
    gh_output = os.environ.get("GITHUB_OUTPUT")
    if gh_output:
        with open(gh_output, "a") as f:
            f.write(f"should_ingest={str(should).lower()}\n")


def main() -> int:
    parser = argparse.ArgumentParser(description="Decide whether to run an ingest")
    parser.add_argument(
        "--days",
        type=int,
        default=3,
        help="A race counts as recent if it ran within this many days (default: 3)",
    )
    args = parser.parse_args()

    if os.environ.get("FORCE_INGEST", "").lower() in ("1", "true", "yes"):
        _emit(True, "FORCE_INGEST set")
        return 0

    today = date.today()

    try:
        from fastf1.ergast import Ergast

        erg = Ergast()
        schedule = erg.get_race_schedule(season=today.year, limit=50)
    except Exception as e:  # noqa: BLE001 — fail open on any fetch error
        _emit(True, f"could not fetch schedule ({e}); failing open")
        return 0

    # Find the most recent race date that is on or before today.
    past_dates = []
    for raw in schedule.get("raceDate", []):
        d = pd.to_datetime(raw, errors="coerce")
        if pd.isna(d):
            continue
        d = d.date()
        if d <= today:
            past_dates.append(d)

    if not past_dates:
        _emit(False, f"no completed races yet in {today.year}")
        return 0

    last_race = max(past_dates)
    days_since = (today - last_race).days
    if days_since <= args.days:
        _emit(True, f"last race {last_race} was {days_since} day(s) ago")
    else:
        _emit(False, f"last race {last_race} was {days_since} day(s) ago (> {args.days})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
