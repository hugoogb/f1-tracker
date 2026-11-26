"""Fetch Fast-F1 sessions and write them in one process (2018+ only).

For a host whose IP Fast-F1 still answers — a laptop, a fresh local seed. The
VPS's is blocked, so in production the same writers are fed by a payload built
off-box (`scripts/fastf1_fetch.py` -> `scripts/fastf1_import.py`); see
`docs/DEPLOYMENT.md`.

Both ingestors walk `find_targets()`, the one definition of what is outstanding
that `pnpm fastf1` and `/status` also read, so a local seed and a payload run
can never disagree about what is left to do. What differs between them is only
which session they load and which writer they feed.
"""

from src.ingestion.base import (
    BaseIngestor,
    build_abbr_to_driver_id,
    is_interrupted,
    race_entrant_codes,
)
from src.ingestion.fastf1_payload import KIND_LAPS, KIND_QUALI_SECTORS
from src.ingestion.fastf1_sessions import (
    AUTH_HELP,
    EMPTY_STREAK_LIMIT,
    F1AuthError,
    fetch_qualifying_bests,
    fetch_race_laps,
    is_blocked_error,
    is_rate_limit_error,
    require_f1_account,
    throttle,
)
from src.ingestion.fastf1_targets import find_targets
from src.ingestion.lap_times import write_lap_rows
from src.ingestion.qualifying_sectors import write_quali_sectors


class _FastF1SessionIngestor(BaseIngestor):
    """The fetch-throttle-write loop the two Fast-F1 ingestors share."""

    kind: str
    noun: str
    written: str

    def fetch(self, year: int, rnd: int) -> tuple[list, object, float]:
        """Load one session: (driver abbreviations, data, load seconds)."""
        raise NotImplementedError

    def write(self, race_id: str, data, abbr_to_id: dict[str, str]) -> int:
        raise NotImplementedError

    def _run(self, year_range: tuple[int, int] | None, refresh_positions: bool = False) -> None:
        self.log(f"Fetching {self.noun} (2018+)...")
        targets = find_targets(
            self.db,
            {self.kind},
            year_range=year_range,
            oldest_first=True,
            refresh_positions=refresh_positions,
        )
        if not targets:
            self.log("Nothing outstanding")
            return
        self.log(f"{len(targets)} race(s) outstanding")

        try:
            require_f1_account()
        except F1AuthError as e:
            self.log(f"No usable Formula 1 account ({e}). {AUTH_HELP}")
            return

        fetched = 0
        records = 0
        empty_streak = 0
        for target in targets:
            if is_interrupted():
                break
            year, rnd, race_id = target["year"], target["round"], target["race_id"]
            label = f"{year} R{rnd}"
            load_elapsed = None
            try:
                self.log(f"{label}: fetching {self.noun}...")
                abbrs, data, load_elapsed = self.fetch(year, rnd)

                if not data:
                    self.log(f"{label}: no {self.noun} available")
                    empty_streak += 1
                    if empty_streak >= EMPTY_STREAK_LIMIT:
                        self.log(
                            f"{empty_streak} sessions in a row came back empty — "
                            f"Fast-F1 is most likely refusing this host. Fetch "
                            f"elsewhere and load with scripts/fastf1_import.py; "
                            f"see docs/DEPLOYMENT.md."
                        )
                        return
                    throttle(load_elapsed, log=self.log)
                    continue
                empty_streak = 0

                abbr_to_id = build_abbr_to_driver_id(abbrs, race_entrant_codes(self.db, race_id))
                if not abbr_to_id:
                    self.log(f"{label}: no driver mapping available")
                    throttle(load_elapsed, log=self.log)
                    continue

                race_records = self.write(race_id, data, abbr_to_id)
                self.db.commit()
                records += race_records
                fetched += 1
                self.log(f"{label}: {race_records} {self.written}")

                throttle(load_elapsed, log=self.log)

            except InterruptedError:
                raise
            except KeyboardInterrupt:
                raise InterruptedError("Seed interrupted by user")
            except Exception as e:
                self.db.rollback()
                if is_blocked_error(e):
                    self.log(
                        f"{label}: Fast-F1 refused this host ({e}). Fetch the sessions "
                        f"somewhere else and load them with scripts/fastf1_import.py — "
                        f"see docs/DEPLOYMENT.md."
                    )
                    return
                if is_rate_limit_error(e):
                    self.log(f"{label}: rate limited, stopping. Re-run later to continue.")
                    break
                self.log(f"{self.noun.capitalize()} {label}: ERROR - {e}")
                if load_elapsed is not None:
                    throttle(load_elapsed, log=self.log)

        self.log(f"{records} {self.written} from {fetched} race(s)")


class LapTimeIngestor(_FastF1SessionIngestor):
    """Lap times, sectors, tyre compound/stint/life and position per lap.

    The only source for lap-level and tyre data — f1db's finest granularity is
    one row per driver per session.
    """

    kind = KIND_LAPS
    noun = "lap times"
    written = "lap times ingested"

    def fetch(self, year, rnd):
        return fetch_race_laps(year, rnd)

    def write(self, race_id, data, abbr_to_id):
        return write_lap_rows(self.db, race_id, data, abbr_to_id)

    def ingest(
        self,
        year_range: tuple[int, int] | None = None,
        refresh_positions: bool = False,
    ) -> None:
        """Fetch and store lap data for races that do not have it.

        `refresh_positions` also re-fetches races whose lap rows predate storing
        Fast-F1's per-lap position — the same opt-in `pnpm fastf1` offers.
        """
        self._run(year_range, refresh_positions=refresh_positions)


class QualifyingSectorIngestor(_FastF1SessionIngestor):
    """Sector times (q1_s1_ms .. q3_s3_ms) on existing qualifying rows."""

    kind = KIND_QUALI_SECTORS
    noun = "qualifying sectors"
    written = "qualifying results updated"

    def fetch(self, year, rnd):
        return fetch_qualifying_bests(year, rnd)

    def write(self, race_id, data, abbr_to_id):
        return write_quali_sectors(self.db, race_id, data, abbr_to_id)

    def ingest(self, year_range: tuple[int, int] | None = None) -> None:
        self._run(year_range)
