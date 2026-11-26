# 0018 — Pipeline scripts

The CLIs under `pipeline/scripts/`.

### Fast-F1 probe target

Where: `pipeline/scripts/fastf1_fetch.py` — `PROBE_YEAR`, `PROBE_ROUND`

The probe loads a long-finished race so the session always exists. A failure then says something about the host's access, not about the calendar.

### Blocked host fails the fetch run

Where: `pipeline/scripts/fastf1_fetch.py` — `main` exit status

A blocked host is the only fetch outcome that exits 1. It means the fetch path has stopped working and someone has to pick another route, while empty or failed sessions leave the exit status at 0.

### Unusable payload is not a success

Where: `pipeline/scripts/fastf1_import.py` — `main` return value

The importer exits 1 when a payload yields no imported session and at least one was skipped. An empty or entirely unusable payload must not look like a success to the caller that purges the cache afterwards.

### Seed restore is delegated to db-restore.sh

Where: `pipeline/scripts/seed.py` — `restore_backup`

Restore shells out to db-restore.sh instead of piping the dump into psql. Backups are full dumps (schema, data, Alembic stamp, views), so the order of restore and `alembic upgrade head` depends on the dump's flavour and that decision lives in one place.

### A failed seed restore is non-fatal

Where: `pipeline/scripts/seed.py` — `restore_backup`

A failed restore logs a warning and the ingest continues. db-restore.sh loads the dump with --single-transaction, so a failure leaves the database as it was, and the ingest upserts either way.

### Seed backup runs after an interrupt

Where: `pipeline/scripts/seed.py` — `main`

The backup step sits outside the try/except that catches an interrupt, so an interrupted load is still dumped and its progress preserved.

### Fetch checks the sign-in before building targets

Where: `pipeline/scripts/fastf1_fetch.py` — `main` (`check_account` before `targets_from_schedule`)

The fetch script checks the F1 account before it builds the target list, not after it finds work. A `--year-range` run reads Fast-F1's event schedule, and without a token Fast-F1 would prompt for a sign-in on every request it sends to live timing. The direct ingestors do the opposite and check only once something is outstanding, so the two orderings are deliberate and should not be made to match.
