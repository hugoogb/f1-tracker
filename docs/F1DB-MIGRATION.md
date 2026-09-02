# Migration plan: jolpica-f1 → f1db

**Status:** investigated, not implemented. This is the plan; nothing in the
pipeline has been changed.

## Why

jolpica-f1 supplies essentially every record in the database and licenses its
data **CC BY-NC-SA 4.0**. That single dependency is what makes the whole project
non-commercial and share-alike. [f1db](https://github.com/f1db/f1db) publishes
equivalent — in places richer — data under **CC BY 4.0**: attribution only.

| | jolpica-f1 (today) | f1db (proposed) |
|---|---|---|
| Licence | CC BY-NC-SA 4.0 | **CC BY 4.0** |
| Commercial use | Forbidden | **Allowed** |
| ShareAlike on our dump | Required | **Not required** |
| Access | HTTP API, ~200 req/hr | Versioned release artifacts (PostgreSQL dump, JSON, CSV, SQLite) |
| Full ingest time | Hours (18s between calls) | Minutes (one download) |
| Circuit layout SVGs | Separate source | **Included**, same layout IDs we already use |
| Update cadence | Live | New release after every race |

Secondary wins: `API_DELAY`, `THROTTLE_DELAY`, the retry/backoff logic and the
pagination helper in `src/ingestion/base.py` all become dead code for the core
entities, and `src/api/country_codes.py` (106 hand-maintained lines) is replaced
by f1db's own `countries` entity, which carries `alpha2Code` and `demonym`.

## What jolpica-f1 is still doing

Everything structural and historical. Of the 13 ingestion modules, six call the
Ergast/jolpica API — `seasons`, `races`, `drivers`, `results`, `pit_stops` and
the pagination/retry plumbing in `base` — and they populate seasons, circuits,
drivers, constructors, races, race results, qualifying, sprint results and pit
stops. That is the backbone of every page on the site.

Two things it is *not* doing, which is why the migration is smaller than it
looks:

- **Standings are computed locally**, not fetched. `StandingsIngestor` derives
  driver and constructor standings (points *and* wins) from `race_results` +
  `sprint_results`.
- **Circuit layouts are not fetched from it either** — those come from
  f1-circuits-svg.

## What f1db does *not* have

Fast-F1 stays for these; it is MIT and imposes no data-licence obligation:

- **Lap-by-lap lap times** (`lap_times`) — powers the lap time, tyre strategy and
  position charts (2018+).
- **Qualifying sector times** (`qualifying_results.s1/s2/s3_ms`) and the
  precomputed `best_quali_s*` columns on `races`.

So the end state is **two upstreams instead of three**: f1db for everything
historical and structural, Fast-F1 for 2018+ timing detail.

## Field mapping

Verified against f1db `src/data` at commit `e296528`.

### Entities

| Our model | f1db source | Notes |
|---|---|---|
| `Season.year` | `seasons/<year>/` | Direct. |
| `Circuit` | `circuits/<id>.yml` | `id`, `name`, `fullName`, `placeName`, `countryId`, `latitude`, `longitude`. Circuit refs largely match today's (`monza`, `bahrain`). |
| `CircuitLayout` | `circuits/<id>.yml` → `layouts[]` | `id` (e.g. `monza-1`), `length`, `turns`. **Replaces the hand-maintained 330-line `circuit_layouts.py`**, including its `SVG_TO_ERGAST` mapping table and `LAYOUT_DATA` seasons strings. |
| `Driver` | `drivers/<id>.yml` | `firstName`, `lastName`, `abbreviation`→`code`, `permanentNumber`→`number`, `dateOfBirth`, `nationalityCountryId`. |
| `Constructor` | `constructors/<id>.yml` | `id`, `name`, `fullName`, `countryId`. |
| `Race` | `seasons/<y>/races/<nn>-<gp>/race.yml` | `round`, `date`, `time`, `circuitId`, `circuitLayoutId`, `officialName`, `laps`, `distance`, `courseLength`, `turns`. Race `name` comes from `grands-prix/<id>.yml` → `fullName`. |
| `RaceResult` | `.../race-results.yml` | `position`, `driverId`, `constructorId`, `laps`, `time`, `gap`, `points`, `gridPosition`, `reasonRetired`. |
| `QualifyingResult` | `.../qualifying-results.yml` | `position`, `q1`, `q2`, `q3`. Sector times **not** present — Fast-F1 keeps supplying those. |
| `SprintResult` | `.../sprint-race-results.yml` | Same shape as race results. `sprint-qualifying-results.yml` also available. |
| `PitStop` | `.../pit-stops.yml` | `stop`, `lap`, `time`. |
| `DriverStanding` | *not needed* | Already computed locally by `StandingsIngestor` from `race_results` + `sprint_results`, including `wins`. f1db's standings files can serve as a cross-check but are not required. |
| `ConstructorStanding` | *not needed* | Same — computed locally. |
| `LapTime` | — | Fast-F1 only. Unchanged. |

### Nationality and country codes

f1db `countries/<id>.yml` provides `alpha2Code` (`GB`) and `demonym`
(`British`), mapping directly onto `Driver.country_code` / `Driver.nationality`
and the constructor equivalents. Delete `src/api/country_codes.py`.

## Verified data delta

Checked against the `f1db-json-single` release artifact (84.5 MB JSON, 6.7 MB
zipped, 1,172 races) and the published schema, not from documentation.

### Losses — three, one of them real

| Field | Status | Verdict |
|---|---|---|
| `race_results.fastest_lap_speed` | f1db has **no speed data** in any of its 45 schema definitions | **Derive it.** Ergast's average speed is lap distance ÷ lap time. f1db supplies `courseLength` and the fastest lap's `timeMillis`: 5.412 km / 92,608 ms → **210.384 km/h** for 2024 Bahrain. Same definition, same value. No net loss. |
| Wikipedia `url` on seasons, races, drivers, constructors, circuits | Absent from f1db | Consumed only by `/api/seasons`; never rendered by the frontend. Drop the columns. |
| `pit_stops.time_of_day` | f1db carries stop duration (`time`, `timeMillis`) but not wall-clock time | Exposed as `timeOfDay` in the API and `types.ts` but **never rendered**. Drop it. |

Everything else on every model maps directly. Spot-checked on 2024 Bahrain:
`positionNumber`, `positionText`, `driverNumber`, `gridPositionNumber`,
`points`, `laps`, `time`, `timeMillis`, `reasonRetired`, `q1`/`q2`/`q3` plus
`q1Millis`/`q2Millis`/`q3Millis`, and fastest lap `lap`/`time`/`timeMillis` are
all populated.

### Gains

| | Today (jolpica) | After (f1db) |
|---|---|---|
| Pit stops | 2012+ (`pit_stops.py` gates on 2012) | **1994+** |
| Qualifying | Ergast's qualifying dataset begins 1994 | **All 1,172 races from 1950** |
| Qualifying times | Strings only | Strings **plus** integer milliseconds |
| Circuit layout `seasons_active` | Hand-maintained 330-line `LAYOUT_DATA` table | **Derived** — every one of the 1,172 races carries `circuitLayoutId` |

Also newly available, unused for now: starting grid positions with penalties,
driver of the day, grand slams, positions gained, engine and tyre manufacturers,
chassis, and free practice results.

### Changes that are not losses

- **Refs** become f1db slugs (`lewis-hamilton`, `red-bull`). Old URLs 404 by
  decision.
- **`statuses`** is rebuilt from f1db's 197 distinct `reasonRetired` values
  (`Engine`, `Accident`, `Collision`, `Gearbox`, …) — the same vocabulary style
  as Ergast's, so the API's `status` string keeps its shape.
- **Standings** stay locally computed; unchanged.

### Dependency cleanup this unlocks

`pillow` (only ever used to resize headshots) and `httpx` (no direct import)
both become unused and can leave `pyproject.toml`.

## Gaps and how to close them

1. **`Status` table.** We store a normalised `statuses` table with a
   `status_id` FK on `RaceResult`. f1db has free-text `reasonRetired`
   (nullable, `null` = classified finisher). Either
   (a) build the `statuses` table from the distinct `reasonRetired` values at
   ingest and keep the FK, or (b) collapse to a nullable
   `race_results.reason_retired` text column and drop the table. **(a) is the
   smaller diff** — it keeps the API shape identical.

2. **`Race.url` / `Driver.url`.** Ergast supplied Wikipedia URLs; f1db does not
   carry them in the same field. Drop the columns, or leave them null. Check
   whether the frontend renders them before deciding.

3. **Fastest laps.** f1db has a dedicated `fastest-laps.yml` per race, which is
   *better* than today's derivation. Map onto the precomputed
   `races.fastest_lap_*` columns.

4. **Refs change.** Drivers become `lewis-hamilton` rather than `hamilton`,
   constructors `red-bull` rather than `red_bull`. Per the decision on record,
   **f1db slugs are adopted with no redirects**: existing `/drivers/hamilton`
   links will 404. Circuit refs mostly coincide already.

## Sequencing

Each step ends green, so it can be paused between steps.

1. **Loader.** Add `src/ingestion/f1db.py` that downloads a pinned f1db release
   (PostgreSQL dump or the JSON artifacts), verifies its version, and caches it.
   Pin the version in config so ingests are reproducible.
2. **Staging load.** Load f1db into its own schema/tables untouched. No mapping
   yet — this makes the raw data queryable for verifying step 3.
3. **Transform.** Write `f1db → our models` mapping per the table above, behind
   a `--source=f1db` seed flag, so the Ergast path still runs. Close the gaps above here.
4. **Reconcile.** Load both into separate databases and diff row counts and spot
   records (champions per season, career win totals, a sampled race result set).
   `scripts/validate.py` already does shape checks; extend it to diff the two.
   **Do not proceed on mismatches you cannot explain.**
5. **Cut over.** Make f1db the default, drop the Ergast ingestors, `base.py`
   rate-limit machinery and `country_codes.py`. Re-seed local, dump, restore to
   Neon.
6. **Circuit SVGs.** Switch `public/tracks/` to f1db's `src/assets/circuits/`
   (`white` variant, same layout IDs). Verified: **159 of our 160 files are
   byte-identical** to f1db's; only `madring-1.svg` differs, and f1db's copy is
   newer (4,495 vs 1,640 bytes). f1db credits Jules Roy for these assets in its
   README, so this is the *same artwork* under the same CC BY 4.0 terms — it
   folds a separate source row into f1db's single credit rather than changing
   who is credited. **Do this step only as part of the migration**: swapping the
   files while jolpica is still the data source would trade one CC BY 4.0 source
   for another and reduce nothing.
7. **Relicense.** Data becomes CC BY 4.0: rewrite `LICENSE-DATA.md`, drop the
   NonCommercial and ShareAlike language from `ATTRIBUTIONS.md`, the footer, the
   `/attributions` page and the README.
8. **Update the scheduled ingest.** `.github/workflows/ingest.yml` changes from
   a calendar-gated API crawl to "check for a new f1db release, load it if the
   version moved". Simpler and far cheaper.

## Effort and risk

- **Effort:** the bulk is steps 3–4. Roughly 2,350 lines of Ergast-coupled
  ingestion are replaced by a loader plus a transform; expect the transform to be
  smaller than what it replaces, and the reconciliation to take longer than the
  code.
- **Risk:** low and reversible. The Ergast path stays until step 5, and step 4
  is a hard gate. The irreversible parts are the URL change (step 5) and the
  Neon re-seed — take a backup first (`scripts/db-backup.sh`).
- **Blast radius:** every `/drivers/*` and `/constructors/*` URL changes. Do
  this before the project has meaningful inbound links, not after.

## After

Sources drop from four to three, and the only remaining licence terms are
attribution:

| Source | Licence | Obligation |
|---|---|---|
| f1db | CC BY 4.0 | Credit + link |
| Fast-F1 | MIT | Credit (courtesy) |
| Natural Earth | Public domain | None |

The project would then be free to become commercial without a licensing
migration — only a trademark review.
