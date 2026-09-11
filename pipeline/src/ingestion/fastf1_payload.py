"""The wire format for Fast-F1 session data fetched off-box.

Formula 1 blocks the VPS's IP, so lap times and qualifying sectors are fetched
where Fast-F1 still answers (a GitHub runner, or a laptop) and carried to the
server as a payload file. That file is newline-delimited JSON, gzip-compressed
by default:

    line 1   {"kind": "header", "schema": 1, "created_at": ..., ...}
    line 2+  one session per line — see `SessionRecord`

NDJSON rather than a SQL dump or a pg_restore archive, deliberately:

* the importer resolves drivers and races against the live database, so the
  payload never carries database ids it might have got wrong;
* it streams, so a fetch that trips the rate limit halfway still yields a
  usable file, and the importer can load it a session at a time;
* it is greppable, diffable and small (a race weekend is tens of KB gzipped),
  which matters when the only way to inspect it is over SSH.
"""

import gzip
import io
import json
import sys
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, BinaryIO

SCHEMA_VERSION = 1

KIND_LAPS = "laps"
KIND_QUALI_SECTORS = "quali_sectors"
KINDS = (KIND_LAPS, KIND_QUALI_SECTORS)

GZIP_MAGIC = b"\x1f\x8b"


class PayloadError(ValueError):
    """A payload file is malformed, truncated or of an unsupported schema."""


@dataclass
class SessionRecord:
    """One fetched session.

    `race_id` is the database id the fetcher was told to target, carried
    through so the importer can match exactly; it is optional because a fetch
    driven by `--year-range` has no database to ask, and `(year, round)` is
    always enough to find the race.

    `abbrs` are the three-letter codes classified in the session. The importer
    intersects them with the race's entrants, so a code reused across eras
    cannot attach laps to the wrong driver.

    `rows` carries lap rows for `KIND_LAPS`; `bests` carries per-segment best
    laps for `KIND_QUALI_SECTORS`.
    """

    kind: str
    year: int
    round: int
    abbrs: list[str] = field(default_factory=list)
    rows: list[dict] = field(default_factory=list)
    bests: dict[str, dict] = field(default_factory=dict)
    race_id: str | None = None
    fetched_at: str | None = None

    def __post_init__(self) -> None:
        if self.kind not in KINDS:
            raise PayloadError(f"Unknown record kind: {self.kind!r} (expected one of {KINDS})")
        self.year = int(self.year)
        self.round = int(self.round)

    @property
    def label(self) -> str:
        return f"{self.year} R{self.round} {self.kind}"

    def to_json(self) -> str:
        payload = {k: v for k, v in asdict(self).items() if v not in (None, [], {})}
        payload["kind"] = self.kind
        payload["year"] = self.year
        payload["round"] = self.round
        return json.dumps(payload, separators=(",", ":"), sort_keys=True)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "SessionRecord":
        try:
            return cls(
                kind=data["kind"],
                year=data["year"],
                round=data["round"],
                abbrs=list(data.get("abbrs", [])),
                rows=list(data.get("rows", [])),
                bests=dict(data.get("bests", {})),
                race_id=data.get("race_id"),
                fetched_at=data.get("fetched_at"),
            )
        except KeyError as e:
            raise PayloadError(f"Record is missing required field {e}") from e


def _header(source: str) -> dict[str, Any]:
    return {
        "kind": "header",
        "schema": SCHEMA_VERSION,
        "created_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "source": source,
    }


@contextmanager
def payload_writer(path: Path | None, source: str) -> Iterator[Any]:
    """Open a payload for writing and yield `write(record)`.

    `path` of None (or "-") writes to stdout. A path ending in `.gz` is
    compressed. Each record is flushed as it is written, so a fetch killed by a
    rate limit or a timeout leaves behind everything it had already fetched.
    """
    if path is None or str(path) == "-":
        raw: BinaryIO = sys.stdout.buffer
        close_raw = False
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        raw = open(path, "wb")
        close_raw = True

    stream: BinaryIO = (
        gzip.GzipFile(fileobj=raw, mode="wb")
        if path is not None and str(path).endswith(".gz")
        else raw
    )

    def write(record: SessionRecord) -> None:
        stream.write(record.to_json().encode() + b"\n")
        stream.flush()

    try:
        stream.write((json.dumps(_header(source), sort_keys=True) + "\n").encode())
        yield write
    finally:
        if stream is not raw:
            stream.close()
        if close_raw:
            raw.close()


def _open_for_read(path: Path | None) -> tuple[BinaryIO, BinaryIO | None]:
    """Open a payload for reading, transparently decompressing gzip.

    Returns `(stream, owned)` — `owned` is the underlying file to close, or
    None when reading stdin, which belongs to the caller.
    """
    if path is None or str(path) == "-":
        raw: BinaryIO = sys.stdin.buffer
        owned: BinaryIO | None = None
    else:
        raw = open(path, "rb")
        owned = raw

    # Sniff rather than trust the extension: the payload also arrives on stdin,
    # where there is no name to go by.
    try:
        magic = raw.peek(2)[:2]  # type: ignore[attr-defined]
    except AttributeError:
        raw = io.BufferedReader(raw)  # type: ignore[arg-type]
        magic = raw.peek(2)[:2]  # type: ignore[attr-defined]

    if magic == GZIP_MAGIC:
        return gzip.GzipFile(fileobj=raw, mode="rb"), owned  # type: ignore[return-value]
    return raw, owned


def read_payload(path: Path | None) -> Iterator[SessionRecord]:
    """Yield the records of a payload, validating its header first."""
    stream, owned = _open_for_read(path)
    try:
        first = stream.readline()
        if not first:
            raise PayloadError("Payload is empty")
        try:
            header = json.loads(first)
        except json.JSONDecodeError as e:
            raise PayloadError(f"Payload header is not JSON: {e}") from e
        if header.get("kind") != "header":
            raise PayloadError("Payload does not start with a header line")
        schema = header.get("schema")
        if schema != SCHEMA_VERSION:
            raise PayloadError(
                f"Payload schema {schema} is not supported (this build reads {SCHEMA_VERSION})"
            )

        for line_no, line in enumerate(stream, start=2):
            text = line.decode().strip()
            if not text:
                continue
            try:
                data = json.loads(text)
            except json.JSONDecodeError as e:
                raise PayloadError(f"Payload line {line_no} is not JSON: {e}") from e
            yield SessionRecord.from_dict(data)
    finally:
        if stream is not owned:
            stream.close()
        if owned is not None:
            owned.close()
