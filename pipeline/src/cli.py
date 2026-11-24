"""Helpers the `scripts/` entry points share.

Imports nothing from the database: `scripts/fastf1_fetch.py` runs on a host
that has none.
"""

import logging
from datetime import date


def setup_logging() -> None:
    """The scripts' one log format, `12:00:00 INFO  message`, on stderr.

    stderr so a script whose stdout is data (`fastf1_status.py`'s JSON, a
    payload on `-`) keeps the two apart.
    """
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)-5s %(message)s",
        datefmt="%H:%M:%S",
    )


def parse_year_range(value: str | None, current_year: bool = False) -> tuple[int, int] | None:
    """Parse '2008-2015' or '2020' into (start, end).

    With no range given, `current_year` stands in for this calendar year alone
    (the scripts' `--current-year`); an explicit range always wins.
    """
    if not value:
        if current_year:
            year = date.today().year
            return (year, year)
        return None
    if "-" in value:
        start, end = value.split("-", 1)
        return (int(start), int(end))
    year = int(value)
    return (year, year)
