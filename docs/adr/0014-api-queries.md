# 0014 — API queries

Query semantics in the FastAPI routers and `src/db/queries.py`.

### Interactive API docs are off by default

Where: `pipeline/src/api/main.py` — `app` construction

The OpenAPI docs advertise the full schema of a public read-only API, so they are served only when FASTAPI_DEBUG is on.

### Teammate filter with no shared team

Where: `pipeline/src/api/routers/compare.py` — driver comparison

Under the teammate filter only races in a shared team count, so two drivers who never shared a team get no head-to-head at all rather than falling back to all races.

### Constructor lineage lookup tolerates several slots

Where: `pipeline/src/api/routers/constructors.py` — lineage lookup

A constructor can hold several slots in its own chain and all name the same lineage, so the lookup takes `.first()` instead of `.scalar_one()`.

### Lineage stats are grouped per season and scoped to a stint

Where: `pipeline/src/api/routers/constructors.py` — lineage members

Results for every member are read in one grouped pass, grouped by season as well as constructor, because a stint is a span of years: Sauber's two spells either side of BMW are separate slots and crediting each with the whole record would double count.

### Ops status uses the latest raced round

Where: `pipeline/src/api/routers/ops.py` — status coverage

The most recent round that has been raced is used, not the last round on the calendar, because mid-season the calendar runs months ahead.

### Large table counts are estimates

Where: `pipeline/src/api/routers/ops.py` — row counts

Tables such as lap_times use the planner's estimate instead of COUNT(*): Postgres has no cached row count, so an exact count is a sequential scan, roughly 1,440 a day behind the 60-second cache on the shared cluster. Where the estimate is unavailable (non-Postgres test database, or no permission on pg_class) the count falls back to COUNT(*).

### Ops reads roll back after a failed statement

Where: `pipeline/src/api/routers/ops.py` — status handlers

A failed statement leaves the session unusable; the request has written nothing, so it rolls back, which keeps later reads working.

### Records explorer is a separate endpoint

Where: `pipeline/src/api/routers/records.py` — records explorer

The explorer slices the same data by era, category and nationality but is its own endpoint rather than parameters on /records, because the curated page is cached, indexed landing content and must keep returning the same shape.

### Season compare walks only rounds actually run

Where: `pipeline/src/api/routers/season_compare.py` — round selection

A season in progress lists its remaining rounds; comparing those would draw both lines flat to December, so only rounds run are used.

### Pole is the qualifying result, not the grid

Where: `pipeline/src/api/routers/season_compare.py` — pole counting

Pole comes from the qualifying result because a grid penalty moves the grid and not the pole; only races with no qualifying data fall back to the grid.

### Season existence is keyed on the season row

Where: `pipeline/src/api/routers/seasons.py` — season detail

The 404 check uses the season row, not its races: a just-ingested season can have no races yet and still exists, and a 200 for /seasons/1900 would make it an indexable page.

### Constructor per driver uses the latest standings table

Where: `pipeline/src/api/routers/seasons.py` — season results lookup

Rows are ordered by the latest table that exists, because in a running season the calendar's last round has no table yet. Results are walked in round order so that a driver's constructor is the one they raced for last.

### Progression colours come from race rows

Where: `pipeline/src/api/routers/standings.py` — progression

Each line's constructor (and so its colour) comes from the race rows, not the last scheduled race, which would leave every driver colourless mid-season while that race has not been run.

### Tied main constructor goes to the season-end team

Where: `pipeline/src/db/queries.py` — `main_constructors`

When a driver raced for two teams equally often in a season, the team they finished the season with is the main one.
