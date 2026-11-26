# 0020 — Ops scripts

Shell scripts under `scripts/` and the hooks: backup, restore, seed, VPS tasks and the Fast-F1 sync.

### Pre-commit ruff uses --force-exclude

Where: `.husky/pre-commit` — ruff invocations

The hook passes `--force-exclude` to ruff so files named explicitly still honour pyproject's `extend-exclude` (alembic/). Without it the hook is stricter than CI, which runs `ruff .`, and generated migrations fail locally but pass in CI.

### Purge secret stays off curl's command line

Where: `pipeline/scripts/purge_cache.sh` — `hdr` header file

The revalidate secret is written to a temp header file and passed with `-H @file` so it never appears in the process list; the file is removed by the EXIT trap.

### bootstrap creates .env before sourcing lib/db.sh

Where: `scripts/bootstrap.sh` — Step 0

.env is copied from .env.example before `lib/db.sh` is sourced, because db.sh reads container and database settings from .env at source time.

### ERR traps name the failing line

Where: `scripts/db-backup.sh`, `scripts/db-restore.sh`, `scripts/seed-fetch.sh` — `trap ... ERR`

Under `set -e` a failing command exits silently, which once turned a missing .env key into a bare `exit 1`. The ERR trap prints the script name and line so the failure is attributable.

### Publish prerequisites are checked before the dump

Where: `scripts/db-backup.sh` — `gh` check

The `gh` CLI check runs before the dump starts because `--remote` streams the whole production database over Tailscale, and discovering a missing `gh` at the end would waste that transfer.

### Local backups are complete plain-SQL dumps

Where: `scripts/db-backup.sh` — local `pg_dump` call

The local dump has no --data-only or --exclude-table so it carries schema, data and Alembic stamp; --clean --if-exists lets it load over an existing database and --no-owner --no-privileges lets it restore under any role. It is plain SQL rather than a custom archive because every restore path pipes it into psql.

### Seed asset is uploaded from latest.sql.gz

Where: `scripts/db-backup.sh` — `LATEST_COPY`, `gh release upload`

`latest.sql.gz` is a real copy, not a symlink, and it (not the timestamped file) is what gets uploaded, because a release asset takes the file's basename and seed-fetch.sh hard-codes that URL. Uploading the timestamped name would publish at a URL nothing fetches.

### Restore verifies the archive before dropping anything

Where: `scripts/db-restore.sh` — `dump_verify_gzip`

The gzip integrity check runs before the schema reset so a truncated or corrupt dump fails while the current data is still intact.

### Restore recreates schema public first

Where: `scripts/db-restore.sh` — `schema_reset_sql`, `load_dump`

The restore emits `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` ahead of the dump inside the same transaction. A `--clean --if-exists` dump only drops objects it owns, so objects added by newer migrations survive as orphans, the dump stamps `alembic_version` back, and `alembic upgrade head` then fails on a table that already exists. If the role does not own `public` the transaction fails and the data stays intact, which is preferred to a silent partial restore.

### Restore loads in one transaction with ON_ERROR_STOP

Where: `scripts/db-restore.sh` — `load_dump`

psql runs with `ON_ERROR_STOP=1` and `--single-transaction`: without the first, psql reports success after skipping statements that failed; the second works because PostgreSQL DDL is transactional, so the dump lands completely or the database is left as it was.

### Restore rebuilds views only after migrations

Where: `scripts/db-restore.sh` — view refresh step

pg_dump already emits REFRESH MATERIALIZED VIEW for populated views, so the explicit rebuild only matters when migrations ran after the load changed something underneath them; it is skippable with SKIP_VIEWS.

### fastf1-sync probe runs before the host check

Where: `scripts/fastf1-sync.sh` — `PROBE` block

`--probe` runs before VPS_HOST is required because it only needs this machine's network, and it is the first thing to run on a new laptop or a connection that has started failing.

### fastf1_status.py stdout is one JSON line

Where: `scripts/fastf1-sync.sh` — `grep '^{' | tail -1`

fastf1_status.py writes progress to stderr and a single JSON line to stdout; the sync keeps only the last line starting with `{` so any narration arriving on stdout through ssh or the task wrapper cannot corrupt the targets file.

### Empty bash arrays are expanded with the ${a[@]+...} form

Where: `scripts/fastf1-sync.sh` — `import_args` expansion

macOS ships bash 3.2, which treats an empty array as unbound under `set -u`, so `import_args` is expanded as `${a[@]+"${a[@]}"}`.

### Dump inspection decompresses the whole file

Where: `scripts/lib/db.sh` — `dump_is_full`, `dump_row_counts`

The dump readers gunzip the entire file instead of stopping at the first hit: closing the pipe early kills gunzip with SIGPIPE, and under `set -o pipefail` that failure would be read as an answer.

### dump_row_counts parses COPY headers by whole line

Where: `scripts/lib/db.sh` — `dump_row_counts` awk script

The awk script sets FS to tab for data rows, but COPY header lines are space-separated, so headers are matched on the whole line and split manually.

### human_size reads byte counts, not du

Where: `scripts/lib/db.sh` — `human_size`

Sizes are computed from `ls -l` field 5 (byte count, identical on GNU and BSD) instead of `du -h`, which reports allocated blocks and gave 6.1M on one machine and 5.3M on another for the same 5.46 MB dump quoted in the release notes.

### env_get returns empty and succeeds for an absent key

Where: `scripts/lib/env.sh` — `env_get`

An absent key yields empty output and exit status 0, because every caller runs under `set -euo pipefail` and a non-zero lookup would abort the script silently. That is why it uses `sed`, which reports no match as empty output, rather than `grep`, which exits 1; optional keys such as VPS_USER and DB_CONTAINER are normal.

### vps helpers use exit 70 for platform refusals

Where: `scripts/lib/vps.sh` — `vps_task`, `vps_deploy`

deploy-app.sh refuses with exit 70, never 1, and the helpers return 70 when VPS_TARGET is unset, so callers can tell the platform refusing from the task itself failing.

### Calendar gate exit codes

Where: `scripts/vps-ingest.sh` — `gate` case statement

should_ingest exits 0 to ingest and 1 to skip; any other status (ssh 255, deploy-app refusal 70) is an error that aborts the run rather than being read as a quiet week.

### Restore order: load, then migrate, then refresh views

Where: `scripts/db-restore.sh` — `load_dump`, `run_migrations`

`public` is recreated before the load, so a restore starts from nothing and cannot inherit an object the dump does not know about. The dump carries its own `alembic_version`, so Alembic runs after the load, where it is a no-op for a current dump and applies the newer migrations to an older backup. pg_dump already refreshes every populated materialized view, so the view rebuild only has work to do when those migrations changed something underneath.

### Row counts come from the dump, not the database

Where: `scripts/lib/db.sh` — `dump_row_counts`

Row counts are read out of the dump's COPY blocks, because the artifact is what gets restored, so the artifact is what gets counted. `qualifying_results` also reports how many rows carry Fast-F1 sector times, which live in columns rather than a table of their own.

### Seed release notes record what the asset holds

Where: `scripts/lib/db.sh` — `seed_release_notes`

The `seed` tag is rolling, so its release notes are the only record of what the current asset contains, above all how many lap times, the expensive half to rebuild.

### Remote arguments are quoted with %q

Where: `scripts/lib/vps.sh` — `vps_task`, `vps_deploy`

Arguments sent through `deploy-app.sh` are quoted with `%q` for the remote shell, so they arrive as the same words they left as.
