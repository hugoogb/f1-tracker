# F1 Tracker - Implementation Checklist

## Phase 0: Project Scaffolding
- [x] Init git repo, pnpm workspace
- [x] Scaffold Next.js app (TypeScript, Tailwind 4, ESLint)
- [x] Init shadcn/ui with dark theme
- [x] Init Python project with uv, add dependencies
- [x] Docker Compose with PostgreSQL 16
- [x] Create .env.example, .gitignore, CLAUDE.md
- [x] Set up Husky + lint-staged

## Phase 1: Database & Data Pipeline
- [x] Define SQLAlchemy models for all entities
- [x] Set up Alembic migrations
- [x] Build ingestion: seasons, circuits, drivers, constructors
- [x] Build ingestion: races, race results, statuses
- [x] Build ingestion: qualifying results
- [x] Build ingestion: driver/constructor standings
- [x] Build ingestion: pit stops (2012+), sprint results (2021+)
- [x] Create materialized views
- [x] Run full initial load (currently 1950-2007 race results only), verify data integrity

## Phase 2: FastAPI Backend
- [x] Set up FastAPI with routers (seasons, drivers, constructors, races, standings)
- [x] Add pagination, filtering (nationality, country), sorting
- [x] Add search endpoint (drivers, constructors, circuits)
- [x] Add champions endpoint
- [x] Add compare endpoint (driver head-to-head)
- [x] Add stats endpoint (DB counts)
- [x] Add sprint + pit stops endpoints
- [x] Add season history endpoints (drivers, constructors)
- [x] Add constructor roster endpoint
- [x] Add nationality/country distinct value endpoints
- [x] Add circuits router (list, detail, countries)
- [x] Write API tests (44 tests: health, seasons, drivers, circuits, constructors, search, records, standings, races, compare, champions)

## Phase 3: Next.js Frontend - Core Pages
- [x] Layout: header with nav links, mobile hamburger menu, theme toggle
- [x] Home page with stats cards, season standings, race calendar, recent champions
- [x] Seasons list and season detail page with standings charts
- [x] Driver list (filterable by nationality) and driver profile page
- [x] Constructor list (filterable by nationality) and constructor profile page
- [x] Race detail page with results/qualifying/sprint/pit stops tabs
- [x] Global search (drivers, constructors, circuits)
- [x] Loading states and error handling for all routes

## Phase 4: UX Polish & Visualizations
- [x] Breadcrumbs on all detail pages
- [x] Points bar charts (driver + constructor standings)
- [x] Career points line charts on driver + constructor profiles
- [x] Driver season-by-season history tables
- [x] Constructor season-by-season history tables
- [x] Circuits list (filterable by country) and circuit detail page
- [x] Footer with branding and data attribution

## Phase 5: Advanced Features
- [x] Driver comparison page (select two drivers, side-by-side stats + career chart overlay)
- [x] Constructor driver roster on constructor detail page
- [x] List page filtering (nationality for drivers/constructors, country for circuits)
- [x] Home page stats cards (total seasons, drivers, constructors, races)
- [x] Recent champions section on home page

## Phase 6: Polish, Testing & CI
- [x] SEO metadata for all pages (home, compare layout)
- [x] Accessibility (skip-to-main link, aria-labels on tables + charts, ARIA on driver-select)
- [x] Type-check script (tsc --noEmit)
- [x] Backend tests (pytest + SQLite in-memory, 44 tests)
- [x] CI pipeline (GitHub Actions: lint, typecheck, build, ruff, pytest, security audits)
- [x] Ruff formatting + lint fixes across backend

## Remaining Work (Future)
- [x] Complete data ingestion (qualifying, standings, pit stops, sprints, 2008-present)
- [x] Run full initial load, verify data integrity

## Recent Additions (Post-Phase 6)
- [x] Country flags and driver headshot images
- [x] Constructor logos via Wikidata/Wikimedia
- [x] Constructor team colors
- [x] Circuit track layout visualizations
- [x] Interactive world map on circuits page
- [x] Framer Motion animations across pages
- [x] Lap time ingestion with throttling and year-range filtering
- [x] Qualifying sector time ingestion (Fast-F1 2018+)
- [x] Lap times and tyre strategy charts on race detail page
- [x] Fastest lap and qualifying sector times on race/circuit pages
- [x] All-time lap record on circuit detail page
- [x] Extract shared ingestion utilities into base module (DRY refactor)
- [x] Add OpenGraph/Twitter metadata and title template
- [x] Standardize frontend API URL parameter building
- [x] Accessibility: aria-label on ListFilter select

## Repository Audit
- [x] Security hardening: SSRF guard on API base URL, path traversal guard on headshot/logo routes, CSP headers, input validation on query params
- [x] N+1 query elimination: bulk-fetch drivers/constructors in champions, records, standings endpoints
- [x] SQL window functions: replace Python position calculation with `SUM() OVER` + `RANK() OVER`
- [x] Extract shared backend helpers: `constants.py`, `serializers.py`, `pagination.py`
- [x] Extract frontend components: podium-card, fastest-lap-card, head-to-head-card, career-stats-table
- [x] Expand backend test coverage: 18 → 44 tests (7 new test files, `race_seed_data` fixture)
- [x] Add pre-commit hooks for Python (ruff check + format on staged .py files)
- [x] Add CI security scanning (pip-audit for Python, pnpm audit for frontend)
