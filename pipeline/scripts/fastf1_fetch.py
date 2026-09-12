"""Fetch Fast-F1 session data into a payload file. No database required.

Formula 1's live timing endpoints refuse datacentre IPs — the VPS's and
GitHub's runners alike — so lap times and qualifying sector times are fetched
from a machine on a residential connection and shipped to the box as a payload
for `scripts/fastf1_import.py` to load. This is the fetching half;
`scripts/fastf1-sync.sh` in the repository root drives all three steps.

It deliberately touches no database: the target list comes from
`scripts/fastf1_status.py` (run on the box) or from the Fast-F1 calendar, and
sessions are keyed by year/round and driver abbreviation until the importer
resolves them against PostgreSQL.

Usage:
    # targets produced on the server by scripts/fastf1_status.py
    uv run python scripts/fastf1_fetch.py --targets targets.json --out payload.ndjson.gz

    # standalone backfill, no server involved
    uv run python scripts/fastf1_fetch.py --year-range 2018-2019 --need laps \\
        --out payload.ndjson.gz

    # is this host allowed to talk to Fast-F1 at all?
    uv run python scripts/fastf1_fetch.py --probe

The payload is streamed and flushed per session, so a run stopped by the rate
limit, a timeout or Ctrl-C still leaves every session it had already fetched.
"""

import argparse
import json
import logging
import os
import sys
from datetime import UTC, date, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.ingestion.fastf1_payload import (  # noqa: E402
    KIND_LAPS,
    KINDS,
    SessionRecord,
    payload_writer,
)
from src.ingestion.fastf1_sessions import (  # noqa: E402
    EMPTY_STREAK_LIMIT,
    PROBE_URLS,
    THROTTLE_DELAY,
    enable_cache,
    fetch_qualifying_bests,
    fetch_race_laps,
    http_check,
    is_blocked_error,
    is_rate_limit_error,
    raise_load_errors,
    throttle,
)

logger = logging.getLogger("fastf1_fetch")

# Probe target: a long-finished race, so the session always exists and the
# result says something about this host's access rather than the calendar.
PROBE_YEAR = 2023
PROBE_ROUND = 1


class _StopFetchError(Exception):
    """Internal: unwind both loops and close the payload cleanly."""


BLOCKED_HELP = (
    "Fast-F1 refused this host. That is the same failure the VPS hits, so the "
    "fetch has to move somewhere else — run this script on a machine with a "
    "residential IP and pass the payload to scripts/fastf1_import.py."
)


def _gha_output(**values: object) -> None:
    """Publish step outputs when running under GitHub Actions."""
    path = os.environ.get("GITHUB_OUTPUT")
    if not path:
        return
    with open(path, "a") as f:
        for key, value in values.items():
            if isinstance(value, bool):
                value = str(value).lower()
            f.write(f"{key}={value}\n")


def load_targets(path: Path, need: set[str]) -> list[dict]:
    """Read a target list produced by scripts/fastf1_status.py."""
    raw = sys.stdin.read() if str(path) == "-" else path.read_text()
    data = json.loads(raw)
    targets = data["targets"] if isinstance(data, dict) else data

    out: list[dict] = []
    for target in targets:
        kinds = [k for k in target.get("need", list(KINDS)) if k in need]
        if not kinds:
            continue
        out.append(
            {
                "race_id": target.get("race_id"),
                "year": int(target["year"]),
                "round": int(target["round"]),
                "need": kinds,
            }
        )
    return out


def targets_from_schedule(year_range: tuple[int, int], need: set[str]) -> list[dict]:
    """Build a target list from Fast-F1's own calendar, for standalone runs.

    Without the database there is no way to know what is already loaded, so
    this returns every completed round in range; the importer is idempotent, so
    re-fetching a session only costs time.
    """
    import fastf1  # imported here so --targets runs need no calendar call

    enable_cache()
    today = date.today()
    targets: list[dict] = []
    for year in range(year_range[0], year_range[1] + 1):
        schedule = fastf1.get_event_schedule(year, include_testing=False)
        for _, event in schedule.iterrows():
            rnd = int(event["RoundNumber"])
            if rnd < 1:
                continue
            event_date = event.get("EventDate")
            if event_date is not None and not _is_past(event_date, today):
                continue
            targets.append({"race_id": None, "year": year, "round": rnd, "need": sorted(need)})
    return targets


def _is_past(event_date, today: date) -> bool:
    try:
        return event_date.date() <= today
    except AttributeError:
        return True


def fetch_session(target: dict, kind: str) -> tuple[SessionRecord | None, float]:
    """Fetch one session, returning `(record, load seconds)`.

    A session with no data yields None rather than an empty record — nothing to
    ship, and the importer should not be asked to decide what that means.
    """
    year, rnd = target["year"], target["round"]
    fetched_at = datetime.now(UTC).isoformat(timespec="seconds")

    if kind == KIND_LAPS:
        abbrs, rows, elapsed = fetch_race_laps(year, rnd)
        if not rows:
            return None, elapsed
        return (
            SessionRecord(
                kind=kind,
                year=year,
                round=rnd,
                race_id=target.get("race_id"),
                abbrs=abbrs,
                rows=rows,
                fetched_at=fetched_at,
            ),
            elapsed,
        )

    abbrs, bests, elapsed = fetch_qualifying_bests(year, rnd)
    if not bests:
        return None, elapsed
    return (
        SessionRecord(
            kind=kind,
            year=year,
            round=rnd,
            race_id=target.get("race_id"),
            abbrs=abbrs,
            bests=bests,
            fetched_at=fetched_at,
        ),
        elapsed,
    )


def probe() -> int:
    """Check whether this host can reach Fast-F1 at all. 0 = yes, 1 = no.

    Two parts, because they answer different questions. The HTTP checks say
    whether Formula 1's servers will talk to this IP — a 403 there is a block,
    an answer from the control host but not from live timing is a block aimed at
    this project's data specifically. The session load then says whether a real
    fetch works end to end.
    """
    # Without this, a refused request is a one-line warning and an empty
    # session, which is indistinguishable from a session that has no data.
    raise_load_errors()

    logger.info("Checking Fast-F1's sources from this host...")
    reachability = {}
    for name, url in PROBE_URLS:
        ok, detail = http_check(url)
        reachability[name] = ok
        logger.log(logging.INFO if ok else logging.ERROR, f"  {name}: {detail}")

    live_timing_ok = reachability.get("live timing archive", False)
    control_ok = any(ok for name, ok in reachability.items() if "control" in name)

    if not live_timing_ok:
        if control_ok:
            logger.error(
                "Live timing refuses this host while the control host answers — "
                "this is an IP block, not an outage."
            )
        else:
            logger.error("Nothing answered — this host may have no outbound access at all.")
        logger.error(BLOCKED_HELP)
        _gha_output(reachable=False, blocked=control_ok, rate_limited=False)
        return 1

    logger.info(f"Loading {PROBE_YEAR} round {PROBE_ROUND} to confirm a real fetch works...")
    try:
        abbrs, rows, elapsed = fetch_race_laps(PROBE_YEAR, PROBE_ROUND)
    except Exception as e:
        blocked = is_blocked_error(e)
        rate_limited = is_rate_limit_error(e)
        logger.error(f"Probe failed: {type(e).__name__}: {e}")
        if blocked:
            logger.error(BLOCKED_HELP)
        elif rate_limited:
            logger.error("This host is rate limited, not blocked — the window clears on its own.")
        _gha_output(reachable=False, blocked=blocked, rate_limited=rate_limited)
        return 1

    if not rows:
        logger.error(
            "The session loaded but carried no laps. Live timing answered the "
            "reachability check, so this is worth reading the warnings above for."
        )
        _gha_output(reachable=False, blocked=False, rate_limited=False)
        return 1

    logger.info(f"Fast-F1 reachable: {len(rows)} laps for {len(abbrs)} drivers in {elapsed:.0f}s")
    _gha_output(reachable=True, blocked=False, rate_limited=False)
    return 0


def parse_year_range(value: str | None) -> tuple[int, int] | None:
    if not value:
        return None
    if "-" in value:
        start, end = value.split("-", 1)
        return (int(start), int(end))
    year = int(value)
    return (year, year)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fetch Fast-F1 sessions into a payload")
    parser.add_argument(
        "--targets",
        type=Path,
        default=None,
        help="Target list from scripts/fastf1_status.py ('-' for stdin)",
    )
    parser.add_argument(
        "--year-range",
        type=str,
        default=None,
        help="Fetch every completed round in this range instead, e.g. 2018-2019",
    )
    parser.add_argument(
        "--need",
        default=",".join(KINDS),
        help=f"Comma-separated data kinds to fetch (default: {','.join(KINDS)})",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Payload path; '.gz' compresses, omitted or '-' writes to stdout",
    )
    parser.add_argument("--limit", type=int, default=None, help="Stop after N sessions")
    parser.add_argument(
        "--no-throttle",
        action="store_true",
        help=f"Skip the {THROTTLE_DELAY}s rate-limit delay (only for cached re-runs)",
    )
    parser.add_argument(
        "--probe",
        action="store_true",
        help="Only check whether Fast-F1 answers this host, then exit",
    )
    return parser.parse_args()


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)-5s %(message)s",
        datefmt="%H:%M:%S",
        stream=sys.stderr,
    )
    logging.getLogger("fastf1").setLevel(logging.WARNING)

    args = parse_args()

    if args.probe:
        return probe()

    need = {k.strip() for k in args.need.split(",") if k.strip()}
    unknown = need - set(KINDS)
    if unknown:
        logger.error(f"Unknown --need value(s): {', '.join(sorted(unknown))}")
        return 2

    year_range = parse_year_range(args.year_range)
    if args.targets:
        targets = load_targets(args.targets, need)
        source = f"targets:{args.targets}"
    elif year_range:
        targets = targets_from_schedule(year_range, need)
        source = f"schedule:{year_range[0]}-{year_range[1]}"
    else:
        logger.error("Pass --targets or --year-range")
        return 2

    if not targets:
        logger.info("Nothing to fetch.")
        _gha_output(sessions=0, partial=False, blocked=False)
        return 0

    planned = sum(len(t["need"]) for t in targets)
    logger.info(f"{len(targets)} race(s), {planned} session(s) to fetch")

    fetched = 0
    empty = 0
    empty_streak = 0
    failed = 0
    partial = False
    blocked = False

    try:
        with payload_writer(args.out, source=source) as write:
            for target in targets:
                for kind in target["need"]:
                    if args.limit is not None and fetched >= args.limit:
                        logger.info(f"Limit of {args.limit} session(s) reached")
                        partial = True
                        raise _StopFetchError

                    label = f"{target['year']} R{target['round']} {kind}"
                    try:
                        logger.info(f"{label}: fetching...")
                        record, elapsed = fetch_session(target, kind)
                    except KeyboardInterrupt:
                        logger.warning("Interrupted — keeping what was fetched so far")
                        partial = True
                        raise _StopFetchError
                    except Exception as e:
                        if is_blocked_error(e):
                            logger.error(f"{label}: {e}")
                            logger.error(BLOCKED_HELP)
                            blocked = True
                            partial = True
                            raise _StopFetchError
                        if is_rate_limit_error(e):
                            logger.warning(
                                f"{label}: rate limited — stopping. "
                                f"Re-run later to continue where this left off."
                            )
                            partial = True
                            raise _StopFetchError
                        logger.error(f"{label}: ERROR - {e}")
                        failed += 1
                        continue

                    if record is None:
                        logger.info(f"{label}: no data available")
                        empty += 1
                        empty_streak += 1
                        if empty_streak >= EMPTY_STREAK_LIMIT:
                            logger.error(
                                f"{empty_streak} sessions in a row came back empty. "
                                f"Fast-F1 does not raise when it is refused, so this "
                                f"is what a block looks like from here."
                            )
                            logger.error(BLOCKED_HELP)
                            blocked = True
                            partial = True
                            raise _StopFetchError
                    else:
                        empty_streak = 0
                        size = len(record.rows) or len(record.bests)
                        logger.info(f"{label}: {size} record(s)")
                        write(record)
                        fetched += 1

                    if not args.no_throttle:
                        throttle(elapsed, log=logger.info)
    except (_StopFetchError, InterruptedError):
        partial = True

    logger.info(
        f"Fetched {fetched} session(s); {empty} with no data, {failed} failed"
        f"{', payload is partial' if partial else ''}"
    )
    _gha_output(sessions=fetched, partial=partial, blocked=blocked)

    # A blocked host is the one failure worth going red for: it means this
    # fetch path has stopped working and somebody has to choose another one.
    return 1 if blocked else 0


if __name__ == "__main__":
    raise SystemExit(main())
