# F1 Tracker

## Project Overview

F1 analytics dashboard covering the complete history of Formula 1 (1950-present) with interactive visualizations and driver comparisons. Full-stack: Next.js frontend + Python FastAPI backend + PostgreSQL.

Deployment: frontend on Vercel; the API runs as a Docker container (`f1_api`) on a self-hosted VPS shared with other projects, against that platform's shared PostgreSQL (see `docs/DEPLOYMENT.md`).

## Tech Stack

- **Frontend**: Next.js 16 (App Router), TypeScript, Tailwind CSS 4, shadcn/ui, Recharts
- **Backend**: Python 3.12, FastAPI, SQLAlchemy 2, Alembic
- **Database**: PostgreSQL 17 — local dev via Docker Compose, production on the VPS platform's shared cluster. Keep the majors matching: a dump only loads into a server of the same or a later version
- **Data Source**: f1db release artifacts (1950-present) + Fast-F1 (session timing, 2018+)
- **Package Managers**: pnpm (frontend), uv (Python)

## Project Structure

- `apps/web/` - Next.js frontend (20 routes, 36+ components)
- `pipeline/` - Python data pipeline + FastAPI backend (14 routers, 50 endpoints); `Dockerfile` builds the API/migrate/ingest image
- `docker/` - `docker-compose.yml` (local dev DB), `compose.prod.yml` (the VPS stack — shipped to `/srv/apps/f1_api/docker-compose.yml` by the deploy), `.env.prod.example`, backups
- `scripts/` - `bootstrap.sh`, `db-backup.sh`, `db-restore.sh`, `seed-fetch.sh` (download the seed dump from its release), `fastf1-sync.sh` (laptop-side Fast-F1 fetch), `lib/db.sh` (shared container resolution + dump inspection + seed release location), `vps/ingest.sh`, `vps/fastf1.sh`, `vps/backup.sh`, `vps/purge-cache.sh` (copied to the VPS by the deploy)

### Frontend Routes

| Route | Description |
|-------|-------------|
| `/` | Home: *Right now* (championship lead, next race countdown + track, top-5 standings, last podium, favourites, title permutations) and *Explore* (live teasers for Best seasons, Compare, Records, Champions), then the World Tour map |
| `/seasons` | Season list (one tile per year with its champion) |
| `/seasons/current` | Route handler: 307 to the latest season (the header's "Current season"; CDN-cached) |
| `/seasons/[year]` | Season detail (scoring note, standings + charts + championship progression, title permutations, cross-era "what if" scoring) |
| `/seasons/[year]/compare` | In-season comparison of two constructors or two drivers (`?type=constructors\|drivers&a=&b=`, defaults to the top two of the standings): points-gap header, cumulative points + gap chart, stat rows with A − B delta chips, head-to-heads, qualifying gap by round, round-by-round table. Server-rendered from `searchParams`, `noindex`, not in the sitemap |
| `/seasons/[year]/races/[round]` | Race detail (results, qualifying, sprint, pit stops, gaps, tyre degradation) |
| `/drivers` | Driver list (filterable by nationality) |
| `/drivers/[ref]` | Driver profile (stats incl. poles/fastest laps/championships, career chart, season history) |
| `/constructors` | Constructor list (filterable by nationality) |
| `/constructors/[ref]` | Constructor profile (stats, career chart, season history, roster, team lineage) |
| `/circuits` | Circuit list (filterable by country) |
| `/circuits/[ref]` | Circuit detail (location, race history) |
| `/champions` | All-time champions |
| `/records` | All-time records (most wins, poles, podiums, championships, fastest laps, starts) |
| `/best-seasons` | Every completed season ranked by title-fight competitiveness (podium, score-over-time chart, sortable table, score methodology) |
| `/compare` | Driver and constructor comparison selector |
| `/compare/drivers` | Side-by-side driver comparison |
| `/compare/constructors` | Side-by-side constructor comparison |
| `/attributions` | Data sources, licences, trademark notice (compliance) |
| `/favourites` | Starred drivers, constructors and circuits (localStorage only, noindex) |
| `/status` | Data freshness, ingest run log, Fast-F1 backlog, row counts (public, noindex) |

Metadata routes (Next file conventions, all under `apps/web/app/`): `sitemap.ts`
(static routes + every season, driver, constructor, circuit and race, rebuilt
daily and on any purge, since it reads `f1-global`), `robots.ts`, `manifest.ts`,
`opengraph-image.tsx` + `twitter-image.tsx` (1200x630 card via `next/og`),
`icon.svg`, `favicon.ico`, `apple-icon.png`.

### Frontend Components

- `components/ui/` - The design system's primitives. Telemetry pieces: `panel` (bracketed surface; replaced shadcn's Card, same sub-part API), `page-hero` (every page's header; `livery`, `watermark`), `tag` (skewed broadcast tag), `meter` (segmented), `section-header`, `container` (the one page width), `stat-card`. shadcn/Base UI pieces restyled to the tokens: button (+ `button-variants.ts`, server-safe), badge, table (`TableRow highlight="leader"`), tabs, select, dialog, sheet, input, skeleton, sonner. Plus country-flag, driver-avatar, constructor-logo, empty-state, motion, position-badge, local-date, next-race-countdown
- `components/layout/` - Header (`main-nav.tsx`: grouped Base UI NavigationMenu from `lib/nav.ts`), mobile nav (bottom sheet, same groups), footer (every section + the credits/disclaimer), breadcrumbs, `command-search.tsx` (⌘K / Ctrl+K / `/` command palette: pages, seasons, races, drivers, teams, circuits; quick links and recently viewed when empty), `record-visit.tsx` (feeds recently viewed), `where-next.tsx` (the links at the foot of every detail page)
- `components/charts/` - Recharts visualizations (points bar, constructor points, career line, comparison line, championship progression, season heatmap, quali-vs-race, driver radar, season points + gap, qualifying gap by round)
- `components/races/` - Race result tables (results with position change indicators, qualifying, sprint, pit stops, lap-times-chart, tyre-strategy-chart, tyre-degradation-chart, position-chart, gap-chart, pit-stop-analysis, podium-card, fastest-lap-card)
- `components/standings/` - Driver + constructor standings tables
- `components/seasons/` - Scoring note, title permutations card, cross-era normalised standings
- `components/seasons/season-calendar-*` - Cinematic calendar world map (the `Calendar` section on
  `/seasons/[year]`, and the "World Tour" section on `/` centred on the next race with a once-per-session
  intro flight from the previous one). `season-calendar-map-wrapper.tsx` is the only entry point: it
  imports the rest with `ssr: false`, mounts it after hydration and once near the viewport.
  `season-calendar-map.tsx` is the playback shell (play/pause, prev/next, scrubbable timeline,
  speed, live km counter, round card), `season-calendar-canvas.tsx` the Leaflet layer,
  `season-calendar-model.ts` the Leaflet-free data model (statuses, legs, `Playhead` store)
- `components/drivers/` - Driver season history table
- `components/constructors/` - Constructor season history table, lineage timeline
- `components/circuits/` - Track layout, world map, world map wrapper
- `components/compare/` - Driver select, constructor select, head-to-head-card (optional team colours), career-stats-table
- `components/season-compare/` - In-season comparison: URL-driven pickers, delta header, stat rows, delta chip, round-by-round table, `sides.ts` (names + colours; teammates' shared livery is tinted lighter for side B)
- `components/records/` - Records explorer (client-side filters, URL-synced via `history.replaceState`)
- `components/best-seasons/` - Season podium, competitiveness chart, ranking table (client-side sort/filter, URL-synced), score breakdown bar, `SeasonRankBadge` (the rank on `/seasons/[year]`)
- `components/home/` - Home sections: standings panel (slab leader row), last-race podium, explore grid (live teasers)
- `components/favourites/` - Star toggle, favourites view, home-page summary, stale-refresh hook
- `components/ops/` - `time-ago.tsx` (relative timestamps on `/status`, via `useNow()`)
- `components/seo/` - `json-ld.tsx` (schema.org graph) and `og-card.tsx` (shared card chrome for every `opengraph-image` route)
- Root: pagination, list-filter, error-boundary

### Backend Endpoints

- `GET /api/health` - Liveness check (used by the container HEALTHCHECK)
- `GET /api/health/db` - Readiness check (verifies PostgreSQL connectivity; 503 when unreachable)
- `GET /api/stats` - DB statistics (counts of seasons, drivers, constructors, races, circuits)
- `GET /api/seasons` / `GET /api/seasons/{year}` - Seasons; the detail carries `scoring`
  (the year's points system, whether every result counted, and any points a driver dropped)
- `GET /api/seasons/{year}/standings/drivers` / `constructors` - Standings
- `GET /api/seasons/{year}/races/{round}` - Race results
- `GET /api/seasons/{year}/races/{round}/qualifying` - Qualifying
- `GET /api/seasons/{year}/races/{round}/sprint` - Sprint results (2021+)
- `GET /api/seasons/{year}/races/{round}/pitstops` - Pit stops (1994+), with time lost vs the race benchmark
- `GET /api/seasons/{year}/races/{round}/pitstops/analysis` - Pit stop analysis (1994+)
- `GET /api/seasons/{year}/races/{round}/positions` - Lap-by-lap positions (2018+)
- `GET /api/seasons/{year}/races/{round}/laps` - Lap times + tyre strategy (2018+)
- `GET /api/seasons/{year}/races/{round}/gaps` - Gap to the leader, lap by lap (2018+)
- `GET /api/seasons/{year}/races/{round}/degradation` - Lap time vs tyre age per compound (2018+)
- `GET /api/drivers` - Drivers (pagination + nationality filter)
- `GET /api/drivers/nationalities` - Distinct nationalities
- `GET /api/drivers/{ref}` - Driver detail with career stats
- `GET /api/drivers/{ref}/seasons` - Driver season-by-season history
- `GET /api/drivers/{ref}/pace` - Qualifying vs race pace per season
- `GET /api/constructors` - Constructors (pagination + nationality filter)
- `GET /api/constructors/nationalities` - Distinct nationalities
- `GET /api/constructors/{ref}` - Constructor detail with career stats
- `GET /api/constructors/{ref}/seasons` - Constructor season-by-season history
- `GET /api/constructors/{ref}/roster` - Driver roster (optional year param)
- `GET /api/constructors/{ref}/lineage` - The chain of renames this entry belongs to
- `GET /api/circuits` - Circuits (pagination + country filter)
- `GET /api/circuits/countries` - Distinct countries
- `GET /api/circuits/{ref}` - Circuit detail with race history
- `GET /api/circuits/{ref}/stats` - Circuit performance stats (most wins, poles, history)
- `GET /api/champions` - All championship winners
- `GET /api/search?q={query}` - Search drivers, constructors, circuits, plus `seasons` and `races`. A standalone year ("monaco 2021") is split off: it finds that season and filters races to it; without a year races match on the race name only (a circuit substring like "ham" in Francorchamps would flood them). `%`/`_` are matched literally
- `GET /api/compare/drivers?d1={ref}&d2={ref}&teammate=bool` - Driver comparison with H2H, quali H2H, radar stats
- `GET /api/compare/constructors?c1={ref}&c2={ref}` - Constructor comparison with head-to-head
- `GET /api/seasons/{year}/compare/entrants` - That season's drivers and constructors, final-standings order (the in-season pickers)
- `GET /api/seasons/{year}/compare/constructors?c1=&c2=` / `GET /api/seasons/{year}/compare/drivers?d1=&d2=`
  - One season, two sides; 404 if either did not race that year, 400 for the same ref twice.
    Every delta is A minus B (positive favours A for points, negative for positions and times).
    Per round: awarded points (race + sprint), the running championship total, finish/grid (best car for a
    constructor), laps led, qualifying gap and clean-lap race pace. Season: the **official**
    championship total from the standings (`points.championship`; `points.dropped` is what the
    best-N rule took off), wins, podiums, poles, fastest laps, DNFs, average grid/finish, points
    finishes, laps led, race and qualifying head-to-heads. The round-by-round line is the official
    table after each round (`cumulativeSource: "official"`), so a dropped result shows as a round
    where a side scored and its line stayed flat; it falls back to the awarded sum only where a
    round has no table. Constructor tables before 1958 are not official (`pointsSource: "results"`).
    Qualifying gap is the best lap in the deepest session both reached (f1db times, so it goes
    back well before 2018); race pace is the median clean lap (lap 1 and anything over 107% of the
    race median dropped, the degradation filter) and needs `SEASON_COMPARE_MIN_CLEAN_LAPS` per
    side; laps led reads Fast-F1 `Position`, falling back to `_cumulative_lap_times()` only on laps
    where every running driver has an unbroken chain. Each carries its coverage and is null with
    no data. Drivers also get `teammates` (`sameTeam`, `sharedRounds`, `constructor`)
- `GET /api/records` - All-time records (most wins, poles, podiums, championships, etc.)
- `GET /api/records/explore?entity=&category=&era=|year_from=&year_to=&nationality=|country=&min_starts=&sort=&page=&limit=`
  - The same records, filtered and paginated. Eras are the points-system ids from
    `/api/points-systems` (a shorthand for that system's seasons, so never both an era and a
    year range); the rate categories carry a non-zero `min_starts` floor; championships come
    from the official final-round standings, never from summed race points
- `GET /api/seasons/{year}/standings/progression` - Round-by-round championship progression
- `GET /api/seasons/{year}/heatmap` - Season results heatmap (driver × round grid)
- `GET /api/seasons/{year}/calendar` - Every round with its circuit's coordinates, the layout SVG in
  use that year, the winner (null if not raced) and `legKm` from the previous round; `totalKm` sums them
- `GET /api/seasons/{year}/permutations` - Who can still win the drivers' title
- `GET /api/seasons/{year}/standings/normalised?system={id}` - The season re-scored under another era
- `GET /api/points-systems` - Every points system the championship has used
- `GET /api/best-seasons?sort=&order=&era=|year_from=&year_to=&include_in_progress=` - Every completed
  season's title margin, deciding round, finale contenders, distinct winners/pole sitters, lead
  changes, constructors' margin (1958+) and a 0-100 score with each weighted component exposed.
  `rank` is by score across all completed seasons whatever the filter. Mounted outside
  `/seasons/{year}` so it cannot be shadowed. `GET /api/best-seasons/{year}` is one season plus its rank
- `GET /api/ops/status` - Data coverage, Fast-F1 backlog, row counts, Alembic revision and the
  latest `ingest_runs` rows, behind `/status`. Public, so it serves only counts, timestamps and
  revision ids — never a hostname, path, env value or error message

## Commands

### Local setup (from root)
- `./scripts/bootstrap.sh` - One-command setup: `.env` + DB + migrations + fetch and restore the seed dump + frontend deps
- `pnpm fastf1` - Fetch the Fast-F1 data the VPS is blocked from and load it there (status -> fetch -> import). Reads `VPS_HOST` from `.env`; flags: `--all`, `--limit`, `--need`, `--year-range`, `--oldest-first`, `--dry-run`, `--probe`, `--purge` (cache purge only), `--host`/`--user`. The script is `scripts/fastf1-sync.sh`. It exits 3 when the data loaded but the frontend purge failed — the site keeps the old pages until `pnpm fastf1 --purge` succeeds

### Frontend (from root)
- `pnpm dev` - Start Next.js dev server
- `pnpm build` - Build for production
- `pnpm lint` - Run ESLint
- `pnpm test` - Frontend unit tests (Vitest; pure helpers in `lib/**/*.test.ts` and `components/**/*.test.ts`)

### Backend (from `pipeline/`)
- `uv run uvicorn src.api.main:app --reload` - Start FastAPI dev server
- `uv run alembic upgrade head` - Run database migrations
- `uv run alembic revision --autogenerate -m "description"` - Generate migration
- `uv run python scripts/seed.py` - Run data ingestion (locally this includes `--laptimes` / `--qualifying-sectors`; on the VPS those two cannot run — see below)
- `uv run python scripts/fastf1_fetch.py --probe` - Check whether this host may talk to Fast-F1 at all (prints HTTP status for live timing and a control host)
- `uv run python scripts/fastf1_fetch.py --targets targets.json --out payload.ndjson.gz` - Fetch Fast-F1 sessions into a payload (no DB needed)
- `uv run python scripts/fastf1_status.py` - List races still missing Fast-F1 data, as JSON (DB, no network)
- `uv run python scripts/fastf1_import.py --payload payload.ndjson.gz` - Load a payload into PostgreSQL (DB, no network)
- `uv run python scripts/seed.py --lineages` - Rebuild constructor lineages only (one of the `--<target>` flags in `seed.py`)
- `uv run python scripts/refresh_views.py` - Rebuild the computed-stats materialized views (`driver_career_stats`, `constructor_career_stats`, `season_champions`); `db-restore.sh` calls this after migrating
- `uv run pytest -v` - Run backend tests (416 tests)
- `uv run ruff check . && uv run ruff format --check .` - Lint + format check

### VPS (production backend)
- App name is `f1_api` everywhere: compose project, container, database, GHCR image. It lives at `/srv/apps/f1_api` on the box
- Deploys: push to `master`, or Actions -> deploy -> Run workflow (optional `ingest` input). CI builds the image and the server pulls it — nothing is built on the VPS and the repo is not checked out there
- `/srv/apps/f1_api/ingest.sh [--force] [-- <seed flags>]` - Calendar-gated f1db ingest + Vercel cache purge (newest season only; everything when custom seed flags are given; `PURGE_SCOPE=--all|--latest` overrides); copied there by the deploy
- `/srv/apps/f1_api/purge-cache.sh [--all | --latest | --years Y,Y]` - Vercel cache purge on its own; `--all` (the default) after a historical backfill or correction
- `/srv/apps/f1_api/fastf1.sh status|import` - The database half of the Fast-F1 path: report what is missing (JSON on stdout), or load a payload arriving on stdin. Formula 1 blocks the VPS's IP, so nothing here fetches from Fast-F1
- `/srv/apps/f1_api/backup.sh > f1_api.sql.gz` - Dump the whole production database to stdout, from a throwaway postgres container on the shared network against `DIRECT_URL`. It asks the server its version first and pulls the matching `postgres:<major>-alpine`, because pg_dump refuses to dump a server newer than itself; `PG_IMAGE` pins one instead. Driven from a laptop by `pnpm db:backup:prod`
- Manual deploy/rollback on the box: `echo "TAG=<sha>" > .tag`, then `docker compose --env-file .env --env-file .tag pull && ... run --rm migrate && ... up -d --wait`
- Env file: `/srv/apps/f1_api/.env` (created by the platform's `new-app.sh`; app-specific keys in `docker/.env.prod.example`) plus `.tag`, which carries only `TAG=<sha>`
- Database is the platform's shared PostgreSQL: the API uses `DATABASE_URL` (PgBouncer), migrations and ingest use `DIRECT_URL` (direct — transaction pooling cannot run a migration). Backups are the platform's job
- Scheduling: `.github/workflows/ingest.yml` — Mondays 06:00 UTC, calendar-gated inside `ingest.sh`; run it by hand from the Actions tab with optional `force`/`flags` inputs. Its last step reports the Fast-F1 backlog, which is a manual job (`scripts/fastf1-sync.sh`)

### Weekend schedules and pit stop timing

Two f1db quirks the UI is built around:

- **Session times exist only for the seasons around the present day** (2024-2026
  at the time of writing) and always as a date/time pair in UTC. They are stored
  on `races` as `fp1_at`/`fp2_at`/`fp3_at`/`qualifying_at`/
  `sprint_qualifying_at`/`sprint_race_at` and served under `schedule` by
  `/api/seasons/{year}` and the race detail endpoint. `lib/schedule.ts` on the
  frontend orders them and picks the next one; a race with no schedule falls
  back to its calendar date, which is midnight UTC and therefore a day marker
  rather than a start time.
- **Lap-by-lap positions come from Fast-F1's own `Position`**, stored on
  `lap_times.position`. Races ingested before that column existed have NULLs,
  and `/positions` falls back to ranking drivers by cumulative lap time for
  them — which needs an unbroken chain from lap 1, so one missing lap time ends
  a driver's line there (the sum of the three sector times stands in where it
  can). Backfill the column with `pnpm fastf1 --refresh-positions --all` (or
  `seed.py --laptimes --refresh-positions` on a host Fast-F1 answers — both
  paths take the same flag and agree on what is outstanding); it re-fetches
  sessions at ~45s each, so it is a deliberate one-off, not part of the weekly
  run, which keeps skipping any race that already has laps. A session Fast-F1
  has no positions for at all is offered again by every `--refresh-positions`
  run, since nothing records the attempt. `/positions` returns `totalLaps` (the race) and `coveredLaps`
  (how far the data reaches) separately — never conflate them, or a race with
  patchy timing renders as a three-lap race.
- **A pit stop's `timeMillis` is pit *lane* time**, entry line to exit line with
  the stationary time included — there is no stationary time in the dataset.
  It runs from ~13s at Melbourne to ~24s at Bahrain, so it is dominated by the
  circuit. Everything comparative is therefore expressed as time lost against
  the quickest stop of the same race (`benchmark`), which is what isolates the
  crew. Do not reintroduce absolute duration buckets: they put every stop of a
  race in one bar.

### Data Updates
- **Automated (f1db)**: `.github/workflows/ingest.yml` runs Mondays 06:00 UTC — joins the tailnet and runs `/srv/apps/f1_api/ingest.sh` on the box, calendar-gated, straight into PostgreSQL, then purges the Vercel cache. The f1db ingestors upsert from one release download, so they can bootstrap an empty DB as well as update one.
- **Manual (Fast-F1)**: `pnpm fastf1` from a machine on a residential connection (`VPS_HOST` in `.env`) — asks the box what is missing (`fastf1.sh status`), fetches those sessions locally (`pipeline/scripts/fastf1_fetch.py`, ~45 s each), ships the payload back and loads it (`fastf1.sh import`). This cannot be automated in CI: `livetiming.formula1.com` returns 403 to the VPS *and* to GitHub's runners (measured — see `docs/DEPLOYMENT.md`). The Monday ingest run reports how many races are waiting, since nothing else will remind you.
- Every run of `run_full_load` writes an `ingest_runs` row (target, start/finish, status,
  `f1db_version`, truncated error) from its **own** session — the ingest's session is unusable
  after a failed statement, so a shared one could only ever log failures that did not involve
  the database. Logging is best-effort: a missing table warns and the ingest continues. This is
  what answers "did Monday's ingest run?", which no amount of derived data can — a successful
  ingest in a mid-season break writes no rows and looks exactly like a silently broken workflow
- `uv run python scripts/should_ingest.py --days 3 [--exit-code]` - Calendar gate; `--exit-code` makes the decision the exit status for shell callers
- `F1DB_VERSION` (env) - f1db release to ingest; `latest` by default, pin a tag for reproducible seeds

### Database
- `pnpm db:backup` / `pnpm db:backup:prod` - Full dump (schema + every table + Alembic stamp + materialized views) of the local dev container, or of production over Tailscale SSH. Use `:prod` for the published seed — Fast-F1 payloads go straight into production, so the server is the only host with the complete dataset
- `pnpm db:seed:fetch` / `pnpm db:seed:publish` - Download the seed dump, or dump production and upload it. **The dump is not tracked by git**: it is an asset on one rolling release tag (`seed`), so the download URL is a constant and a refresh never grows the pack. `db:seed:publish` is `db-backup.sh --remote --publish` and needs `gh` authenticated; it refuses to publish a dump with no lap times
- `pnpm db:restore` - Restore a dump. Detects full vs legacy data-only dumps and orders the migrate/load/refresh steps accordingly; `SKIP_MIGRATE=1 SKIP_VIEWS=1` restores a full dump with nothing but `psql`
- `docker compose -f docker/docker-compose.yml up -d` - Start PostgreSQL (container `f1-tracker-db`)
- `docker compose -f docker/docker-compose.yml down` - Stop PostgreSQL
- `docker compose --env-file .env --env-file .tag <cmd>` - Production stack, run from `/srv/apps/f1_api` on the VPS

## Conventions

- Use conventional commits (feat:, fix:, docs:, refactor:, test:, chore:)
- Frontend: shadcn/ui components in `components/ui/`, feature components in `components/<feature>/`
- Backend: FastAPI routers in `src/api/routers/`, SQLAlchemy models in `src/db/models.py`
- Backend shared helpers: `src/api/constants.py` (magic numbers), `src/api/serializers.py` (driver/constructor dict builders), `src/api/pagination.py` (generic paginator), `src/scoring.py` (historical points systems)
- Fast-F1 code is split by what it needs: `src/ingestion/fastf1_sessions.py` is network-only (no DB import, so it runs on a host with no database), `src/ingestion/fastf1_targets.py` holds `find_targets()` — the one definition of what is outstanding, shared by `scripts/fastf1_status.py` and `/api/ops/status` so the page and `pnpm fastf1` can never disagree, `src/ingestion/fastf1_payload.py` is the NDJSON wire format between the two hosts, and the writers (`write_lap_rows`, `write_quali_sectors`) are shared by the direct ingestors and the payload importer — keep it that way so the off-box path cannot drift from the local one
- All API endpoints prefixed with `/api/`
- Next.js frontend calls FastAPI at `NEXT_PUBLIC_API_URL` (default: http://localhost:8000/api)
- Dark-only UI (no light theme, no toggle) in the "telemetry" design: HUD panels with corner brackets on a
  blueprint grid, Barlow Condensed italic for display titles/numbers (`display`), Chakra Petch for labels and
  readouts (`label`, `font-data`), Titillium Web for body text. Broadcast touches are accents only: skewed
  `Tag`s, the red `.slab` / `highlight="leader"` row, the logo. Spec: `docs/superpowers/specs/2026-10-21-ui-ux-overhaul-design.md`
- **Design tokens are the only source of colour.** Everything is a token in `app/globals.css` registered in
  `@theme` (`bg-surface-0..3`, `border-hairline`, `text-label`, `*-accent-livery`, `fastest`, `gold/silver/bronze`,
  `side-a/b`, `tyre-*`, `positive/negative`, `chart-1..5`). No hex/oklch literals or raw palette classes
  (`text-blue-500`) in components; the only literals live in `lib/chart-theme.ts` (computed heatmap scale, the
  best-seasons score set), `lib/map-theme.ts` (Leaflet needs concrete values), `components/seo/*` (Satori cannot
  read CSS variables), `lib/utils.ts`'s `teamColorOf` default (the OG cards use it) and `lib/seo.ts`/`manifest.ts`
- **Livery**: `var(--accent-livery)` (default red) drives brackets, meters, tabs underline and hero stripe; set it
  with `liveryStyle(color)` (`lib/livery.ts`) on a page root or one panel. A driver page uses
  `latestTeamColor(seasons)` — the most recent team, red when that team has no colour, never an older team's.
  shadcn's own `--accent` is its hover surface, unrelated
- **Charts** spread `axisProps`/`gridProps`/`lineCursor`/`barCursor` from `lib/chart-theme.ts` and use
  `ChartTooltip`/`TooltipFrame` (`components/charts/chart-tooltip.tsx`) or the `chart-tooltip` utility; series
  without a team colour use `SERIES`. Comparison sides keep their team colours (`season-compare/sides.ts`) and fall
  back to `sideColor('a'|'b')` only when a side has none; colours may be CSS variables, so derive translucency with
  `color-mix(...)`, never a hex alpha suffix
- Track layouts render through `TrackOutline` (`components/circuits/track-outline.tsx`): f1db's white SVG used as
  a CSS mask over the accent colour
- Navigation lives in `lib/nav.ts` (header, mobile sheet and footer read it). The header renders on every page and
  fetches nothing; "Current season" links to `/seasons/current`, a route handler that looks the year up `no-store`
  and 307-redirects with a CDN `Cache-Control`. Season prev/next arrows are bounded by `seasonNeighbours()`
  (1950 … current calendar year) and race arrows by `roundNeighbours()` (`lib/neighbours.ts`)
- Use `Promise.allSettled` for optional data fetching (graceful degradation)
- Constructor colours come from the backend palette (`src/ingestion/colors.py`)
  and travel on every constructor payload; the frontend only picks a fallback,
  via `teamColorOf()` in `lib/utils.ts`. Never key a colour off a driver ref, and
  never reintroduce a second palette in the frontend — refs are f1db's
  (`red-bull`), not Ergast's (`red_bull`), and a mismatched map fails silently
- The palette has two tiers. `CONSTRUCTOR_COLORS` is a hand-curated livery and
  is the only tier claiming to describe a real car; everything else gets a
  stable shade of its national racing colour from `derive_color()`, keyed off
  `constructors.country_code`, so none of f1db's 187 constructors renders grey.
  Only a constructor f1db gives no country stays uncoloured, and the ingest logs
  it. Derived shades are hashed from the ref, never randomised — a colour that
  moved between ingests would churn the table weekly and change what a reader
  saw last week. Add a curated entry rather than tuning the derivation when a
  specific team looks wrong, and keep `tests/test_constructor_colors.py`'s
  current-grid and champions lists passing: those teams must stay curated
- Anything whose output depends on the viewer's clock, locale or timezone goes
  through `useHydrated()`/`useNow()` in `lib/client-only.ts` (and the
  `LocalDate`/`LocalDateTime`/`LocalTime` components) so the server pass and the
  first client render agree. Never format a date with a hardcoded locale
- Page metadata goes through `buildMetadata()` in `lib/seo.ts` — it fills in the
  canonical URL, Open Graph and Twitter cards from one title/description, and
  the root layout's `%s | F1 Tracker` template appends the suffix, so a page
  title must never carry it itself. Pass `image` (and `imageAlt`) to opt a page into its own
  `opengraph-image` route — `buildMetadata` otherwise pins the site-wide card, because Next
  only folds the file convention in for pages that do not declare `openGraph` themselves
- Satori drops any lowercase word that is a key of `Object.prototype` — `constructor` above
  all, half the vocabulary of the sport — rendering it as blank space of the right width. Run
  every dynamic string through `satoriText()` in `components/seo/og-card.tsx`; fixed copy can
  dodge it by being uppercase or plural
- `NEXT_PUBLIC_SITE_URL` is the canonical origin behind every canonical tag,
  Open Graph URL and sitemap entry; nothing else should hardcode the host
- `fetchApi` throws `ApiError` with the upstream status. Detail pages call
  `notFound()` only when `isNotFound(reason)` and rethrow otherwise, so an API
  outage never tells a crawler the resource does not exist
- Icons are generated from `app/icon.svg`; regenerating `favicon.ico`,
  `apple-icon.png` and the `public/icon-*.png` set means re-rendering from it
  rather than editing the binaries
- Client components (`'use client'`) only for interactive pieces (charts, filters, tabs, search)
- The calendar map's great-circle maths exists twice on purpose — `pipeline/src/geo.py` (the API's
  `legKm`/`totalKm`) and `apps/web/lib/geo.ts` (the arcs it draws) — with the same haversine and
  mean radius; change both or neither. Its "next race" comes from `useNow()` + `raceStart()` and is
  only ever computed in the client-mounted component, so there is no server render to disagree
  with. Per-frame playback goes through the `Playhead` external store and imperative Leaflet
  updates, never React state; `prefers-reduced-motion` turns every flight into an instant jump and
  skips the home intro
- Anything derived from Fast-F1 lap times (`/positions`, `/gaps`) shares
  `_cumulative_lap_times()` in the races router. A cumulative total needs an
  unbroken chain from lap 1, so it stops at a driver's first missing lap rather
  than adding across the hole; both endpoints report `totalLaps` (the race) and
  `coveredLaps` (how far the data reaches) so the UI can say so
- Tyre degradation filters before it fits: lap 1 and anything slower than 107%
  of the race's median are dropped, because a pit or safety-car lap is seconds
  off the pace and the wear being measured is tenths. Report `cleanLaps` against
  `totalLaps` wherever the slope is shown
- A season's scoring context makes two claims from two sources, and the wording
  has to keep them apart. The points system is a fact about the year, from
  `src/scoring.py`. Whether results were dropped is read off the results — a
  championship total below what a driver scored — because some form of "best N
  results" applied from 1950 to 1990 but the N changed almost every season, some
  years split the calendar into halves scored separately, and none of that is in
  f1db. State the era rule generally and let the data supply the example; never
  assert a specific N
- Best seasons: champion, runner-up and margins come from the official final standings; the
  round-by-round metrics (lead changes, finale contenders) walk the official table after every
  round, the same one `/standings/progression` draws. The deciding round is f1db's flag
  (`races.drivers_title_decider`), because under the best-N rules a title can be settled before
  the arithmetic on the visible totals says so; only a season without a flag falls back to the
  permutations' `max_points_remaining()`/`still_in_contention()`. Pre-1991 finale contenders are an
  upper bound (a final-round result could have been one a driver had to drop) — the notes say so.
  `progressionApproximate` now means only "a round had no official table, so points scored stood
  in". Score weights live in `COMPONENTS` in `routers/best_seasons.py` and travel in the response
- **Standings are stored after every round**, not just the last. `StandingsIngestor` keeps the
  final round on its own path (local sum, then `_apply_official`, so a season f1db has no table for
  still gets one) and writes f1db's official per-race table for every earlier round
  (`_apply_rounds`); those rows are official or absent, never a sum. f1db lists a driver only
  once they have scored, so `official_running_totals()` in `src/db/queries.py` carries an absent
  entity's last total and returns None unless every round has a table. Anything that wants the
  final table must keep picking the season's last round (`MAX(round)`), as every existing reader
  does — never "any row for this season"
- Race reconciliation purges a season only when a round vanished or moved to another circuit
  f1db still knows. A stored circuit f1db no longer has at all is a rename (`sochi` -> `sirius`)
  and is repointed in place: a purge deletes the season's Fast-F1 lap times, which the VPS cannot
  fetch again
- Constructor lineages come from f1db's `chronology` and are a chain of
  *entries*, not of teams — Red Bull is the far end of Stewart's chain. Never
  merge one member's record into another's or inherit a colour along a chain; a
  constructor can also hold several slots in its own chain (Sauber), so slot
  stats are scoped to that slot's years
- Pages are cached, not re-rendered per request, and the cache is the Hobby plan's scarcest
  budget: every ISR/Data Cache entry written (first render, or a regeneration whose output
  changed) is billed in 8 KB units. Freshness comes from the fetch-level `revalidate`/`tags` in
  `lib/api.ts` (`cacheScopeFor`), which Next infers as the route's own revalidate, and from the
  ingest purge. Every cached fetch carries `f1-data` (the full purge) plus one scoped tag:
  `f1-season-<year>` (anything under `/seasons/{year}` or `/best-seasons/{year}`),
  `f1-driver|constructor|circuit-<ref>` (one entity's endpoints), `f1-reference` (data no import
  changes — `/points-systems`; 30-day TTL, reached only by a full purge) or `f1-global` (lists,
  records, champions, stats). A fetch's tags become the tags of every page that reads it, so a
  per-season or per-entity page must never read an `f1-global` endpoint: the season page reads
  `/points-systems`, which is why it is `f1-reference` — under `f1-global` every weekly purge
  expired all seventy-odd finished season pages. Seasons before the current year get a 30-day
  TTL instead of a day.
  `app/api/revalidate` takes no body / `{"scope":"all"}` (expire `f1-data`), `{"scope":"latest"}`
  or `{"years":[...]}` (expire those seasons, their entrants' and circuits' entity tags, and
  `f1-global`; it falls back to everything if it cannot ask the API who took part). The weekly
  `ingest.sh` sends `--latest`, `pnpm fastf1` sends the payload's years via `PURGE_YEARS`, and
  `purge-cache.sh --all` is the manual full purge (after a backfill or an f1db correction to an
  old season). Add a new endpoint under the path that matches its scope, or teach
  `cacheScopeFor` about it. The purge calls `revalidateTag(tag, { expire: 0 })`, never `'max'`:
  `'max'` is stale-while-revalidate, so the next visitor would still get the page rendered before
  the import. `purge-cache.sh` exits non-zero and prints a `::warning::` when the purge does not
  land (unset URL/secret, 401 from a mismatched `REVALIDATE_SECRET`), and its callers report it.
  The `[ref]`/`[year]` detail routes each export an empty `generateStaticParams()` — without one a
  dynamic segment never enters the full route cache, and with one returning `[]` nothing is
  prerendered at build while the first request for a path still caches it. The routes that stay
  server-rendered are the seven reading `searchParams` (`/seasons/[year]/compare` is the seventh)
  and `/status` (`dynamic = 'force-dynamic'`: `/api/ops/status` stamps `generatedAt`, so a cached
  copy was rewritten on every refresh). Endpoints with unbounded URL spaces — head-to-head pairs,
  the records explorer's filter combinations — are fetched `no-store` so they never become cache
  entries; the explorer's route handler is cached by the CDN via `Cache-Control` instead, which is
  free. `/` sets `revalidate = 3600` because it splits the calendar on the render-time clock.
  Keep cached output deterministic — no render-time timestamps, random ids or "x minutes ago"
  on the server (that is what `useNow()` is for): a regeneration that changes bytes is a write,
  one that does not is free. Pass client components only the fields they draw (the race page's
  `chartLaps`): their props are stored twice per cached page, in the RSC payload and the HTML.
  Links that list many heavy detail pages (race rows, season tiles) set `prefetch={false}`.
  A segment config export must be a **literal** — Next reads it by static analysis
  without evaluating the module, so `export const revalidate = SOME_CONSTANT` fails
  the build with "Invalid segment configuration export detected"
- Pre-commit: Husky runs lint-staged (prettier) + ruff check/format on staged `.py` files
- CI: GitHub Actions `ci.yml` — frontend (audit, format, lint, typecheck, build) + backend (ruff, pip-audit, pytest) + backend image (docker build + smoke test)
- CD: GitHub Actions `deploy.yml` — on push to `master` touching `pipeline|docker/compose.prod.yml|scripts/vps`, builds and pushes `ghcr.io/hugoogb/f1_api:<sha>`, joins the tailnet as `tag:ci`, then over Tailscale SSH ships `docker-compose.yml`+`ingest.sh`+`fastf1.sh`+`purge-cache.sh`, pulls, migrates, `up -d --wait` and checks `/api/health/db`. Secrets are `VPS_HOST`/`TS_OAUTH_CLIENT_ID`/`TS_OAUTH_SECRET` — there is no SSH key (Tailscale SSH authenticates by tailnet identity), and no DB credentials leave the server
- Docker naming: local dev is prefixed with `STACK_NAME` (default `f1-tracker`); on the VPS the platform's convention wins and everything is named `f1_api`, so the project stays distinguishable on a box running several apps
- Shell scripts resolve the DB container via `scripts/lib/db.sh` (`STACK_NAME`/`DB_CONTAINER`) — never hardcode a container name

## Licensing & API Compliance

**Three sources, every obligation is attribution.** f1db (CC BY 4.0) supplies the dataset and the
circuit SVGs; Fast-F1 (MIT) supplies session timing from 2018; Natural Earth (public domain)
supplies the map. Nothing restricts commercial use or imposes share-alike. See `ATTRIBUTIONS.md`
for the inventory and `LICENSE-DATA.md` for the dataset licence.

Rules to preserve when changing code:

- **Never remove** the trademark disclaimer or data credits from `components/layout/footer.tsx` or
  the `/attributions` page.
- **No driver photos or team logos.** OpenF1, TheSportsDB and Wikimedia Commons were all removed;
  `DriverAvatar` and `ConstructorLogo` render initials on the team colour. Do not reintroduce an
  image source without adding a row to `ATTRIBUTIONS.md` — see its "Deliberately not used" table.
- **Map** uses bundled Natural Earth geometry (`public/geo/world.geo.json`, public domain), not
  raster basemap tiles. Do not add a `TileLayer` back: CARTO/OSM tiles require visible attribution
  and are non-commercial on the free tier.
- **Rate limits**: keep `THROTTLE_DELAY` (45s, Fast-F1 ~500 calls/hr) — it now lives in
  `src/ingestion/fastf1_sessions.py` and is re-exported from `base.py`. It applies wherever the
  fetch runs, CI included. f1db is a single release download, so it needs no throttling.
- **Standings** must keep using f1db's official points (`StandingsIngestor._apply_official`).
  Summing raw race points crowns the wrong champion in the pre-1991 "best N results" seasons.
  `src/scoring.py` re-derives points on purpose, but only ever for the hypothetical
  `/standings/normalised` table and the permutations arithmetic — never for the
  standings the site publishes, and every surface that shows it says it is a what-if.
- New data sources need a row in `ATTRIBUTIONS.md` and an entry in `DATA_SOURCES` on the
  attributions page before they ship.

## Next Phases

### Phase 3 — Advanced Features
- **Weather data** (2018+): Air/track temp, humidity, wind, rainfall from Fast-F1 — new `RaceWeather` model
- **Race control events** (2018+): Safety cars, flags, penalties — timeline overlay on lap times chart
- **Telemetry visualization** (2018+): Speed/throttle/brake traces — on-demand from Fast-F1 cache (not stored in DB)
- **OpenF1 live data** (2023+): Real-time positions, intervals, team radio — WebSocket/SSE architecture

## Known Issues

- Next.js 16 build requires `NODE_ENV=production` to avoid `_global-error` prerender bug
- "Invalid segment configuration export detected" names no file under Turbopack. Re-run with
  `NEXT_COMPILER_NAME=server` to get the offending route. The cause is always a non-literal
  `revalidate`/`dynamic`/`runtime` export
- Renaming the local dev DB container (`docker-db-1` → `f1-tracker-db`) orphans the old `docker_pgdata` volume; re-run `./scripts/bootstrap.sh`, then `docker volume rm docker_pgdata`
- **The local dev database moved from PostgreSQL 16 to 17** to match the VPS's shared cluster. A PostgreSQL 16 data directory will not start under 17 (`database files are incompatible with server`), so an existing volume has to go — it holds nothing that is not in the backup:
  ```bash
  docker compose -f docker/docker-compose.yml down -v   # or: docker volume rm f1-tracker_dev_pgdata
  ./scripts/bootstrap.sh                                # recreates and restores
  ```
  The majors have to match in this direction specifically: `pg_dump` output is only guaranteed to load into a server of the same or a later version, and `latest.sql.gz` now comes from production. A 17 dump fails on a 16 server at `SET transaction_timeout`, which does not exist before 17
- **Formula 1 blocks datacentre IPs for Fast-F1 — the VPS's and GitHub's runners alike** (403 from `livetiming.formula1.com`; the control host answers 200, so it is a block, not an outage). Lap times and qualifying sectors therefore cannot be ingested on the server or in CI: they are fetched from a laptop with `pnpm fastf1` (`scripts/fastf1-sync.sh`) and imported as a payload. `scripts/fastf1_fetch.py --probe` re-checks any host in about a second. Fast-F1 does not raise when it is refused — it warns per source and returns an empty session — so three empty sessions in a row abort with the blocked-host message rather than grinding through the calendar at 45 s each.
- The seed dump is a **full** dump and carries the Fast-F1 data (`lap_times`, qualifying sector columns) so a restore never means re-fetching it at ~45 s/session. It only does so when it was taken from production (`pnpm db:seed:publish`) — a local dump carries whatever lap times that database happens to hold, `db-backup.sh` warns when there are none, and `--publish` refuses outright. A seed without them leaves race pages' lap-time, tyre-strategy and position charts empty after a restore
- **The seed dump is no longer committed** — it is an asset on the rolling `seed` release, fetched by `scripts/seed-fetch.sh` (which `bootstrap.sh` calls when `docker/backups/latest.sql.gz` is absent). gzip does not delta-compress, so each committed refresh added its full ~5 MB to the pack forever rather than a diff; sixteen versions had made a ~5 MB artifact into ~49 MB of unshakeable history. Do not re-add it to git — `.gitignore` covers `docker/backups/*`. Publishing replaces the asset in place, so the URL in `lib/db.sh` stays valid
- **Driver headshots and team logos were purged from git history**, not just deleted — `4cb10e1` removed them from the tree for licensing reasons, but every clone still carried them until the history rewrite. Do not reintroduce an image source without the `ATTRIBUTIONS.md` row the Licensing section requires
