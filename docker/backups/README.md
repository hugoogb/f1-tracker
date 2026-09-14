# Database backups

`latest.sql.gz` is a **complete** dump of the F1 Tracker database — schema,
every table's data, the Alembic stamp and the materialized views:

```
pg_dump --format=plain --no-owner --no-privileges --clean --if-exists
```

Write one with `../../scripts/db-backup.sh`, load one with
`../../scripts/db-restore.sh`.

**Nothing in this directory is tracked by git.** The dump is published as a
release asset instead, and `bootstrap.sh` downloads it on a fresh clone:

```bash
../../scripts/seed-fetch.sh     # pnpm db:seed:fetch
```

It used to be committed, which cost more than it looked like. gzip does not
delta-compress, so each refresh added its full size to the pack permanently
rather than a diff — nine superseded copies had grown a ~5 MB artifact into
~35 MB of history that no clone could ever shed. The release asset is fetched
once, is never part of `git clone`, and can be replaced in place.

## What it contains

Everything. That is the point: it is a restore-from-nothing artifact, not a
convenience seed.

| | Source | Covers |
|---|---|---|
| Seasons, races, circuits and layouts, drivers, constructors, results, qualifying, sprints, official standings, pit stops | f1db | 1950–present |
| `lap_times` (lap-by-lap times, sectors, tyre compound and stint) | Fast-F1 | 2018–present |
| Qualifying sector times (`q1_s1_ms` … `q3_s3_ms` on `qualifying_results`) | Fast-F1 | 2018–present |
| `driver_career_stats`, `constructor_career_stats`, `season_champions` | Derived | — |

The Fast-F1 half is why the dump is worth its size. Those sessions fetch at
roughly one per 45 seconds and **cannot be fetched from the VPS or from CI at
all** — Formula 1 answers datacentre IPs with a 403 — so re-fetching a few
seasons is hours of a laptop's evening. Restoring a backup is seconds.

`pg_dump` emits `REFRESH MATERIALIZED VIEW` for every populated view, so the
career-stats, records and champions endpoints come back filled in without
running anything afterwards.

## Restoring

```bash
../../scripts/db-restore.sh                  # latest.sql.gz, prompts first
../../scripts/db-restore.sh path/to.sql.gz   # a specific file
```

The dump carries its own schema and Alembic stamp, so nothing has to exist
first. `db-restore.sh` loads it, then runs `alembic upgrade head` to carry an
older backup up to the current head, then rebuilds the views. With
`SKIP_MIGRATE=1 SKIP_VIEWS=1` it needs nothing but `psql` — which is the path
that matters when the thing that broke is the reason you are restoring.

Older **data-only** dumps (what this repo wrote before) still restore: they are
detected by the absence of a schema and get the old treatment — migrate first,
load the data, then rebuild the views by hand.

## Regenerating and publishing it

```bash
./scripts/db-backup.sh --remote --publish   # from the VPS  (pnpm db:seed:publish)
./scripts/db-backup.sh --remote             # dump only, don't publish
./scripts/db-backup.sh                      # from the local dev container
```

**Use `--remote` for the published seed.** Fast-F1 payloads are imported
straight into production (`pnpm fastf1`), so the server is the only host where
the complete dataset exists; a local dump carries lap times only for whatever
you happen to have ingested yourself. `db-backup.sh` prints the row counts of
whatever it wrote and warns when `lap_times` is empty, so a backup that silently
lost the expensive half does not pass as fine — and `--publish` refuses outright
rather than replacing the seed everyone else bootstraps from with a lapless one.

`--publish` needs the [GitHub CLI](https://cli.github.com) authenticated as
someone who can write releases. It uploads to one rolling tag (`seed`) with
`--clobber`, so the download URL never changes, and rewrites the release notes
with the date and row counts — the tag being rolling, those notes are the only
record of what the current asset holds.

Expect roughly 5 MB gzipped once the Fast-F1 data is in. Regenerate it when
there is something worth keeping, not on every ingest.

## Licence

The data derives from two sources, both requiring only attribution:

- **f1db** — [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
  Attribution required, commercial use permitted, no share-alike.
- **Fast-F1** — lap and sector timing (2018+). MIT-licensed software; the timing
  originates from Formula 1's own systems and is used here for editorial and
  analytical purposes.

Neither is covered by the repository's MIT code licence.

Modifications: reshaped into a relational schema and augmented with derived
statistics.

See [../../LICENSE-DATA.md](../../LICENSE-DATA.md) and
[../../ATTRIBUTIONS.md](../../ATTRIBUTIONS.md).
