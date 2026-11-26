# 0016 — Ingestion

f1db and Fast-F1 ingestion, constructor colours, lineages and race reconciliation.

### ingest_runs rows_written is NULL where not counted

Where: `pipeline/src/db/models.py` — `IngestRun.rows_written`

Only callers that count what they wrote fill the column; the f1db ingestors merge row by row and report no total, so theirs stays NULL rather than zero.

### ingest_runs index is declared after the class

Where: `pipeline/src/db/models.py` — `IngestRun` index

Reads are always the most recent N runs, so the index is ordered that way; it is declared outside the class body because the expression needs the mapped attribute, which does not exist until the body has run.

### Fast-F1 cache directory is created up front

Where: `pipeline/src/ingestion/base.py` — cache setup

Fast-F1's enable_cache requires the directory to exist, so it is created first; a fresh environment (CI, cron, new clone) would otherwise fail before ingesting.

### Renamed teams need one colour entry per f1db ref

Where: `pipeline/src/ingestion/colors.py` — `CONSTRUCTOR_COLORS`

f1db renames a team on a rebrand and keeps the old id for earlier seasons, so a team can need several entries (rb and racing-bulls; sauber, kick-sauber and audi), and refs that f1db treats as one continuous entry share a colour (lotus-racing and caterham). Curated entries added with the national-colour fallback are teams whose livery is a matter of record; lotus-racing and caterham are one continuous chronology entry in f1db and share a colour.

### Stewart's colour is the tartan navy

Where: `pipeline/src/ingestion/colors.py` — `stewart` entry

Stewart's white cars would vanish as a chart line against the light theme, so the entry uses the navy of the Racing Stewart tartan.

### Achromatic national bases are cooled and kept saturated

Where: `pipeline/src/ingestion/colors.py` — `NATIONAL_RACING_COLORS`, `derive_color`; `pipeline/src/ingestion/colors.py` — `derive_color`

A truly neutral grey has hue 0, so variation would swing it through pinks and browns; silver and the silver-fern black use a cool base, and even achromatic bases get a little saturation so hue has something to act on. The New Zealand black is cooled for the same reason as silver. Even an achromatic base gets a little saturation so silver-era constructors do not separate on lightness alone.

### Derived shades spread additively around the base

Where: `pipeline/src/ingestion/colors.py` — `derive_color`

Spreads are added around a centre rather than multiplied through the base, because a multiplier collapses at both ends: British racing green clamped every shade to one floor and silver produced identical greys.

### Sign-in is checked only when there is work

Where: `pipeline/src/ingestion/fastf1_ingest.py` — direct ingest loop

The F1 account check runs only once there is something to fetch, so a run with nothing outstanding never asks anyone to sign in.

### Rate-limit failures stop the run

Where: `pipeline/src/ingestion/fastf1_ingest.py` — fetch loop

A rate limit stops the process instead of retrying, since the rolling window needs time to clear and what was written is already committed; a failed load may still have hit the network, so the throttle applies. A load that fails may already have hit the network, so the throttle delay still applies after it.

### Payload compression is sniffed

Where: `pipeline/src/ingestion/fastf1_payload.py` — payload reader

Gzip is detected from the bytes, not the file name, because the payload also arrives on stdin where there is no name.

### Cache hits skip the throttle

Where: `pipeline/src/ingestion/fastf1_sessions.py` — throttle threshold

A load that returns very fast came from the cache and cost no API call, so it is not throttled.

### Probe reads 403 and 451 as an IP block

Where: `pipeline/src/ingestion/fastf1_sessions.py` — probe

403 (and 451) is what an IP block looks like from outside; 429 is the rate limit, a different problem.

### Sector targets need existing qualifying rows

Where: `pipeline/src/ingestion/fastf1_targets.py` — `find_targets`

Qualifying sector times fill in existing qualifying rows, so a race without them has nothing to attach to and is not a target.

### Run log error text is truncated

Where: `pipeline/src/ingestion/full_load.py` — ingest run logging

A SQLAlchemy exception string can contain the whole failing statement and a connection error can carry the DSN with its password, so the error column is cut to one line and never served.

### Lineage chains skip unknown constructors

Where: `pipeline/src/ingestion/lineages.py` — chain storage

A chain can name a constructor the release does not carry as an entrant; storing it would break the foreign key, so it is skipped and the rest of the chain is kept.

### Race child tables are deleted in FK order

Where: `pipeline/src/ingestion/races.py` — child table list

Child tables keyed by race_id are listed children first so deletes before the races themselves respect foreign keys.

### Only schedulable f1db sessions are mapped

Where: `pipeline/src/ingestion/races.py` — session key map

Free practice 4, pre-qualifying, split qualifying 1/2 and warm-up are historical formats f1db has no schedule for, so they are left out.

### Shared drives keep the first winner

Where: `pipeline/src/ingestion/standings.py` — win counting

Shared drives (1950s) can list two winners; the first stands.

### Single-session qualifying times are stored in q1

Where: `pipeline/src/ingestion/results.py` — `QualifyingIngestor.ingest` (`q1`)

Before knockout qualifying, f1db gives one `time` per driver instead of `q1`/`q2`/`q3`. That time is stored in `q1` when the row has no `q1` and no `q3`. The season compare's qualifying gap reads the deepest session both drivers reached (`q3`, `q2`, `q1`), and it reaches back before 2006 only because of this fallback.

### Qualifying split catches every exception

Where: `pipeline/src/ingestion/fastf1_sessions.py` — `extract_qualifying_bests`

`Laps.split_qualifying_sessions()` raises bare, untyped exceptions for unusual qualifying sessions. The call is wrapped in a broad `except Exception` that logs at debug level and returns no sector data, so one odd session cannot abort a fetch run. Do not narrow it to a specific exception type.
