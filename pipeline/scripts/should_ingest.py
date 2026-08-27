"""Calendar gate for the scheduled ingest workflow.

Decides whether a race happened recently enough to justify an ingest run, so the
weekly cron doesn't waste runs (or pull partial data) on off-weekends.

Prints the decision, and writes ``should_ingest=true|false`` to $GITHUB_OUTPUT
when running in GitHub Actions. Exit code is 0 either way unless ``--exit-code``
is passed, which makes the decision the exit status (0 = ingest, 1 = skip) so a
shell caller can gate on it:

    python scripts/should_ingest.py --days 3 --exit-code && ./run-ingest

Fails OPEN: on any error fetching the schedule it returns ``true`` so a real
race weekend is never silently skipped.

Usage:
    uv run python scripts/should_ingest.py [--days N] [--exit-code]

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

# Set by main() from --exit-code; when true the decision becomes the exit status.
_EXIT_CODE_MODE = False


def _emit(should: bool, reason: str) -> int:
    print(f"should_ingest={str(should).lower()} — {reason}")
    gh_output = os.environ.get("GITHUB_OUTPUT")
    if gh_output:
        with open(gh_output, "a") as f:
            f.write(f"should_ingest={str(should).lower()}\n")
    if _EXIT_CODE_MODE:
        return 0 if should else 1
    return 0


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
        help="Exit 0 to ingest, 1 to skip (for shell/systemd callers)",
    )
    args = parser.parse_args()

    global _EXIT_CODE_MODE
    _EXIT_CODE_MODE = args.exit_code

    if os.environ.get("FORCE_INGEST", "").lower() in ("1", "true", "yes"):
        return _emit(True, "FORCE_INGEST set")

    today = date.today()

    try:
        from fastf1.ergast import Ergast

        erg = Ergast()
        schedule = erg.get_race_schedule(season=today.year, limit=50)
    except Exception as e:  # noqa: BLE001 — fail open on any fetch error
        return _emit(True, f"could not fetch schedule ({e}); failing open")

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
        return _emit(False, f"no completed races yet in {today.year}")

    last_race = max(past_dates)
    days_since = (today - last_race).days
    if days_since <= args.days:
        return _emit(True, f"last race {last_race} was {days_since} day(s) ago")
    return _emit(False, f"last race {last_race} was {days_since} day(s) ago (> {args.days})")


if __name__ == "__main__":
    sys.exit(main())
