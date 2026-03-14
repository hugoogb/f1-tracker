# F1 Tracker - Implementation Checklist

## Phase 0: Project Scaffolding
- [x] Init git repo, pnpm workspace
- [x] Scaffold Next.js app (TypeScript, Tailwind 4, ESLint)
- [x] Init shadcn/ui with dark theme
- [x] Init Python project with uv, add dependencies
- [x] Docker Compose with PostgreSQL 16
- [x] Create .env.example, .gitignore, CLAUDE.md
- [ ] Set up Husky + lint-staged

## Phase 1: Database & Data Pipeline
- [x] Define SQLAlchemy models for all entities
- [x] Set up Alembic migrations
- [x] Build ingestion: seasons, circuits, drivers, constructors
- [x] Build ingestion: races, race results, statuses
- [ ] Build ingestion: qualifying results
- [ ] Build ingestion: driver/constructor standings
- [ ] Build ingestion: pit stops (2012+), sprint results (2021+)
- [ ] Create materialized views
- [ ] Run full initial load (currently 1950-2007 race results only), verify data integrity

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
- [ ] Write API tests

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

## Phase 6: Remaining Work
- [ ] Complete data ingestion (qualifying, standings, pit stops, sprints, 2008-present)
- [ ] Responsive design pass
- [ ] SEO metadata for all pages
- [ ] CI pipeline (lint, test, build)
- [ ] API tests
- [ ] Set up Husky + lint-staged
