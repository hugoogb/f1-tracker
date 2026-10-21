# Telemetry UI Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin and restructure the whole `apps/web` frontend into the "telemetry-led, broadcast-accented, livery-aware" design, on a real token/component system, with grouped navigation, a search that finds everything and no dead-end pages.

**Architecture:** Tokens first (`globals.css` `@theme`), then a small set of shared primitives (`Panel`, `Tag`, `Meter`, `SectionHeader`, `PageHero`, `Container`, chart theme) that every page migrates onto, then navigation/search, then page-by-page migration, then a sweep that deletes the legacy glass/glow CSS and audits for hard-coded colours. One backend change: `/api/search` also returns seasons and races.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind CSS 4 (`@theme`), shadcn (base-nova, Base UI), Recharts 3, react-leaflet 5, `next/font/google`; FastAPI + SQLAlchemy 2 + pytest for the search change; Vitest (new dev dependency) for pure frontend helpers.

**Spec:** `docs/superpowers/specs/2026-10-21-ui-ux-overhaul-design.md` — read it before any task. It holds the visual language; this plan holds the decisions about files, names and tests.

## Global Constraints

- Dark only: keep `className="dark"` on `<html>`; no light palette, no theme toggle.
- Fonts via `next/font/google` only: **Barlow Condensed** (italic 800, display — titles, hero names, hero numbers), **Chakra Petch** (400/500/600/700 — labels, nav, numbers, tables), **Titillium Web** (400/600/700 — body). Remove Orbitron, Plus Jakarta Sans, JetBrains Mono.
- Brand red is the `--primary` F1 red (`oklch(0.55 0.25 27)` ≈ `#E10600`); it is also the default `--accent`.
- Team colours come only from API payloads via `teamColorOf()` (`lib/utils.ts`); never a frontend palette, never keyed off a driver ref.
- No glassmorphism, `backdrop-blur`, glow, drop shadows or gradient text in new code. Radius ≤ `rounded-sm` (2px) except pills/avatars.
- No hex/oklch literals or raw Tailwind palette classes (`text-blue-500`, `amber-*`, `zinc-*`…) in components; use tokens. Allowed exceptions: `components/seo/*` (Satori cannot read CSS variables) and the Leaflet `pathOptions` in the two map files, which read from `lib/map-theme.ts`.
- Cached output stays deterministic: no render-time timestamps/random ids; clock-dependent UI goes through `useNow()`/`LocalDate`; pass client components only the fields they draw; `prefetch={false}` on links in long lists of heavy pages.
- Per-season / per-entity pages must not fetch an `f1-global` endpoint (`cacheScopeFor` in `lib/api.ts`). The header/footer (rendered on every page) fetch nothing.
- No driver photos, no team logos, no map tile layers. Footer trademark disclaimer and data credits and `/attributions` stay verbatim.
- Page metadata through `buildMetadata()`; titles never include "| F1 Tracker".
- Every animation honours `prefers-reduced-motion`.
- Keep the land-pane fix in `season-calendar-canvas.tsx` / `circuits/world-map.tsx` (commit `2b857e1`).
- Conventional commits; each task ends with a green `pnpm typecheck && pnpm lint && pnpm test` in `apps/web` (and `uv run pytest` + ruff for backend tasks).

## Review Focus

1. A driver/constructor whose payload colour is `null` (f1db gives some no country) → livery falls back to red, no `undefined` CSS variable, no grey page. *(Task 9 test `latestTeamColor returns null…`, Task 2 test `liveryStyle(null)`.)*
2. Search for things that don't exist or are odd: `"1949"`, `"monaco 2099"`, `"2021"` alone, `"%"`/`"_"` → 200 with empty arrays, never a 500 or every row. *(Task 5 tests.)*
3. Navigation at the edges: season 1950 and the current year, round 1 and the last round → no link to a page that 404s. *(Task 10 tests for `seasonNeighbours` / `roundNeighbours`.)*
4. `localStorage` that throws (Safari private mode, blocked site data) or holds corrupt JSON → recently-viewed is an empty list, search still opens. *(Task 6 tests.)*
5. Keyboard-only use: `/` must not hijack typing in an input/textarea/contenteditable; the palette is fully operable with arrows/Enter/Escape and announces as a combobox/listbox. *(Task 6 tests for `isTypingTarget` + a manual keyboard check step.)*

## Verification recipe (referenced by tasks as "visual check")

1. DB: `docker compose -f docker/docker-compose.yml up -d`; if the API 500s with `UndefinedColumn`, run `cd pipeline && uv run alembic upgrade head`.
2. `cd pipeline && uv run uvicorn src.api.main:app --port 8000` (background) and `pnpm dev` from the repo root (background).
3. With the Playwright MCP tools, open the listed routes at 1440×900 and 390×844, take screenshots into `.playwright-mcp/` (gitignored by the tool), and check: no horizontal scroll at 390px, no console errors, the look matches the spec.

---

### Task 1: Tokens and fonts

**Files:**
- Modify: `apps/web/app/globals.css` (whole file)
- Modify: `apps/web/app/layout.tsx:1-25` (fonts), `:118` (main container → `Container` comes in Task 2; here only swap font variables)
- Modify: `apps/web/components/ui/sonner.tsx` (toast colours from tokens)

**Interfaces:**
- Produces Tailwind utilities every later task uses:
  - colours: `bg-surface-0..3`, `border-hairline`, `border-hairline-strong`, `text-label` (muted label grey), `bg-accent-livery`/`text-accent-livery`/`border-accent-livery` (reads `var(--accent)`), `text-fastest`, `bg-gold`/`text-gold`, `silver`, `bronze`, `side-a`, `side-b`, `tyre-soft|medium|hard|inter|wet|unknown`, `positive`, `negative` (existing names kept).
  - fonts: `font-display` (Barlow Condensed), `font-data` (Chakra Petch), `font-sans` (Titillium Web). `font-heading` and `font-mono` are **removed**; Task 14's audit greps for them.
  - type step: `text-2xs` (11px / 1.3) for labels.
  - CSS variables: `--accent` defaults to `var(--primary)` on `:root`; a livery page overrides it inline on its root element via `liveryStyle()` (Task 2), which sets both `--livery` and `--accent`, so every descendant using `var(--accent)` follows.
  - utility classes in `@layer components`: `.bg-grid` (24px blueprint grid, lines ≈ `oklch(1 0 0 / 3%)`), `.label` (font-data, `text-2xs`, uppercase, `tracking-[0.14em]`, `text-label`), `.display` (font-display italic 800 uppercase, `leading-[0.88]`), `.skew-tag` (skewX(-12deg) with a `> *` counter-skew), `.slab` (the red skewed leader/winner row background via `clip-path: polygon(0 0,100% 0,99% 100%,0 100%)`), `.focus-ring` (`focus-visible:outline-2 outline-offset-2 outline-ring`).
- Keeps (until Task 14 deletes them) the legacy classes `.glass`, `.glow-border`, `.card-glow`, `.glow-red`, `.speed-lines`, `.accent-line`, `.text-gradient`, `.pos-1..3`, and the `--glass-*`/`--surface-*` variables, so pages not yet migrated still render. Mark the block `/* LEGACY — removed in Task 14 */`.

- [ ] **Step 1: Rewrite `globals.css` tokens.** Surfaces: `--surface-0: oklch(0.09 0.004 250)` (page), `--surface-1: oklch(0.12 0.005 250)` (panel), `--surface-2: oklch(0.15 0.006 250)` (raised row/hover), `--surface-3: oklch(0.19 0.006 250)`; `--hairline: oklch(1 0 0 / 9%)`, `--hairline-strong: oklch(1 0 0 / 16%)`; `--label: oklch(0.68 0.01 250)` (≥4.5:1 on surface-1 at 11px); `--background` = surface-0; `--card`/`--popover` = surface-1 (opaque, no alpha); semantic: `--fastest: oklch(0.65 0.2 305)`, `--gold: oklch(0.82 0.15 85)`, `--silver: oklch(0.8 0.01 250)`, `--bronze: oklch(0.68 0.12 55)`, `--side-a: var(--primary)`, `--side-b: oklch(0.75 0.13 220)`, tyres with the same hues as today's `lib/constants.ts` values; chart series `--chart-1..5` kept and re-tuned for the new surface. Register **all** of them in `@theme inline` as `--color-*`. Base layer: `body` gets `bg-surface-0 bg-grid font-sans`; `h1` = `.display text-5xl lg:text-6xl`, `h2` = `font-data text-lg font-semibold uppercase tracking-wider`, `h3` = `font-data text-sm font-semibold uppercase tracking-wider`. `--radius: 0.125rem`.
- [ ] **Step 2: Swap fonts in `layout.tsx`** to `Barlow_Condensed({ weight: ['600','700','800'], style: ['normal','italic'], variable: '--font-barlow' })`, `Chakra_Petch({ weight: ['400','500','600','700'], variable: '--font-chakra' })`, `Titillium_Web({ weight: ['400','600','700'], variable: '--font-titillium' })`; map them to `--font-display`, `--font-data`, `--font-sans` in `@theme`.
- [ ] **Step 3: Verify.** `cd apps/web && pnpm typecheck && pnpm lint && pnpm build` → all pass. Visual check `/` and `/drivers`: new fonts and grid background visible; legacy pages still render (unstyled bits acceptable at this stage, nothing broken).
- [ ] **Step 4: Commit** `feat(ui): telemetry design tokens and fonts`.

### Task 2: Core primitives, Panel migration and a unit-test harness

**Files:**
- Create: `apps/web/components/ui/panel.tsx`, `tag.tsx`, `meter.tsx`, `section-header.tsx`, `page-hero.tsx`, `container.tsx`
- Create: `apps/web/lib/livery.ts`, `apps/web/lib/meter.ts`
- Create: `apps/web/vitest.config.ts`, `apps/web/lib/__tests__/livery.test.ts`, `apps/web/lib/__tests__/meter.test.ts`
- Modify: `apps/web/package.json` (devDependency `vitest` pinned to the current 3.x, script `"test": "vitest run"`), root `package.json` (`"test": "pnpm --filter web test"`), `.github/workflows/ci.yml` (frontend job runs `pnpm test` after typecheck)
- Delete: `apps/web/components/ui/card.tsx`, `apps/web/components/ui/page-header.tsx`
- Modify: every importer of `@/components/ui/card` (28 files) and `@/components/ui/page-header` (12 files) — mechanical rename
- Modify: `apps/web/app/layout.tsx:118` → `<Container as="main" …>`

**Interfaces:**
- Produces:
  - `Panel(props: ComponentProps<'div'> & { accent?: string | null; brackets?: boolean /* default true */; size?: 'default' | 'sm' })` — flat `bg-surface-1 border border-hairline`, corner brackets (2px, 10px L-shapes top-left + bottom-right) in `var(--accent)`; `accent` sets `--accent` inline. Sub-parts with the **same names and props as the old Card parts**: `PanelHeader`, `PanelTitle` (renders `.label`-style text, not a heading tag), `PanelDescription`, `PanelAction`, `PanelContent`, `PanelFooter`. Keep `data-slot="card…"` → rename to `data-slot="panel…"` and update the one selector in `globals.css` (`.group\/card [data-slot='table-container']` → `group/panel` / `panel`).
  - `Tag(props: { variant?: 'solid' | 'red' | 'outline'; className?: string; children: ReactNode; render?: useRender props })` — skewed broadcast tag (`.skew-tag`), Chakra Petch 700 uppercase `text-2xs`.
  - `Meter(props: { value: number; max: number; segments?: number /* 10 */; accent?: string | null; label: string /* accessible name */; className?: string })` — `role="meter"`, `aria-valuenow/min/max`, skewed segments; filled count from `filledSegments`.
  - `filledSegments(value: number, max: number, segments: number): number` in `lib/meter.ts` — `round(value/max*segments)` clamped to `[0, segments]`; `max <= 0` or non-finite → 0.
  - `SectionHeader(props: { eyebrow?: string; title: string; href?: string; linkLabel?: string /* 'View all' */; as?: 'h2' | 'h3' })` — link uses `ArrowRight` icon, not `&rarr;`.
  - `PageHero(props: { title: ReactNode; eyebrow?: ReactNode; description?: ReactNode; badge?: ReactNode; tags?: ReactNode; actions?: ReactNode; livery?: string | null; watermark?: string; children?: ReactNode; className?: string })` — the old `PageHeader` props are a subset (`title, description, badge, actions, className, children`), so the rename is mechanical. Renders `h1` (display font), a thin livery/red stripe under it, optional large faint `watermark` (car number) on the right. When `livery` is given it applies `liveryStyle(livery)` to its root.
  - `Container(props: { as?: 'div' | 'main' | 'section'; className?: string; children: ReactNode })` — `mx-auto w-full max-w-[1400px] px-4 md:px-8` (the single source for page width; header/footer use it in Task 7).
  - `liveryStyle(color: string | null | undefined): React.CSSProperties` in `lib/livery.ts` — `{}` for null/undefined/empty, else `{ '--livery': color, '--accent': color }`.

- [ ] **Step 1: Add Vitest and write failing tests.**
  ```ts
  // lib/__tests__/meter.test.ts
  expect(filledSegments(8, 38, 10)).toBe(2)
  expect(filledSegments(15, 38, 10)).toBe(4)
  expect(filledSegments(50, 38, 10)).toBe(10)   // clamped
  expect(filledSegments(-1, 38, 10)).toBe(0)
  expect(filledSegments(5, 0, 10)).toBe(0)       // no division by zero
  expect(filledSegments(NaN, 10, 10)).toBe(0)
  // lib/__tests__/livery.test.ts
  expect(liveryStyle(null)).toEqual({})
  expect(liveryStyle('')).toEqual({})
  expect(liveryStyle('#00D7B6')).toEqual({ '--livery': '#00D7B6', '--accent': '#00D7B6' })
  ```
- [ ] **Step 2: Run** `cd apps/web && pnpm test` → FAIL (modules not found).
- [ ] **Step 3: Implement** `lib/meter.ts`, `lib/livery.ts`, then the six components.
- [ ] **Step 4: Run** `pnpm test` → PASS.
- [ ] **Step 5: Migrate importers.** Rename imports/JSX `Card*` → `Panel*` and `PageHeader` → `PageHero` across `app/` and `components/` (sed is fine; then fix any `className` that relied on Card's `rounded-2xl`/`shadow`). Delete `card.tsx` and `page-header.tsx`. `grep -rn "ui/card\|ui/page-header\|<Card\b\|PageHeader" apps/web/app apps/web/components` → no hits.
- [ ] **Step 6: Verify** `pnpm typecheck && pnpm lint && pnpm test && pnpm build` → pass; visual check `/drivers`, `/seasons`, `/champions`: panels have brackets, titles in Barlow.
- [ ] **Step 7: Commit** `feat(ui): panel, tag, meter, page hero and test harness`.

### Task 3: Restyle the remaining base components

**Files:**
- Modify: `apps/web/components/ui/button.tsx`, `badge.tsx`, `tabs.tsx`, `select.tsx`, `dialog.tsx`, `sheet.tsx`, `input.tsx`, `table.tsx`, `skeleton.tsx`, `stat-card.tsx`, `empty-state.tsx`, `position-badge.tsx`, `next-race-countdown.tsx`, `driver-avatar.tsx`, `constructor-logo.tsx`
- Delete: `apps/web/components/ui/dropdown-menu.tsx`, `separator.tsx` (0 importers — confirm with grep first)
- Modify: hand-styled button links listed in the audit to use `buttonVariants`: `app/seasons/[year]/page.tsx` (×3), `app/compare/drivers/page.tsx` (×2), `app/compare/constructors/page.tsx`, `components/season-compare/delta-header.tsx`, `components/ui/empty-state.tsx`, `app/drivers/[ref]/page.tsx:220`

**Interfaces:**
- Consumes: tokens (Task 1), `Panel` (Task 2).
- Produces:
  - `buttonVariants` variants: `default` (red, square-ish, Chakra Petch uppercase), `outline` (hairline border, surface-1), `ghost`, `livery` (bg `var(--accent)`, dark text), `link`; sizes unchanged. All include `.focus-ring`.
  - `Table` = readout table: `font-data tabular-nums`, header row `.label` on `bg-surface-2`, body rows separated by `border-dashed border-hairline`, row hover `bg-surface-2`; new `TableRow` prop `highlight?: 'leader'` renders the red `.slab` background (used for P1/winner rows in Tasks 9–12).
  - `PositionBadge` uses `gold/silver/bronze` tokens (single podium palette; the `.pos-1..3` CSS goes in Task 14).
  - `StatCard` = a `Panel` with `.label` label and the value in `.display` (keeps its props).
  - `Badge` keeps its API but its look matches `Tag` (`outline` variant used by existing callers).
  - `Skeleton` = flat `bg-surface-2` pulse, no rounded-xl.
- [ ] **Step 1: Restyle** each file to the tokens; no hex/oklch literals.
- [ ] **Step 2: Verify** `pnpm typecheck && pnpm lint && pnpm test && pnpm build`; visual check `/`, `/seasons/2025`, `/seasons/2025/races/1` (tables, tabs, badges), open the mobile menu at 390px (sheet).
- [ ] **Step 3: Commit** `feat(ui): restyle base components to telemetry look`.

### Task 4: One chart theme

**Files:**
- Create: `apps/web/lib/chart-theme.ts`, `apps/web/components/charts/chart-tooltip.tsx`
- Modify: all 16 Recharts files: `components/charts/*.tsx` (except `season-heatmap.tsx`, which is a table — give it the `gold/silver/bronze` tokens instead of its own oklch values), `components/races/{gap-chart,lap-times-chart,pit-stop-analysis,position-chart,tyre-degradation-chart}.tsx`, `components/best-seasons/competitiveness-chart.tsx`, `components/circuits/circuit-stats.tsx`
- Modify: `apps/web/lib/constants.ts:43` tyre colours → `var(--color-tyre-*)` strings

**Interfaces:**
- Produces (from `lib/chart-theme.ts`, values are CSS-variable strings so they follow the tokens):
  - `axisProps: { tick: { fill: 'var(--color-label)', fontSize: 11, fontFamily: 'var(--font-data)' }, axisLine: { stroke: 'var(--color-hairline)' }, tickLine: false }`
  - `gridProps: { stroke: 'var(--color-hairline)', strokeDasharray: '3 4', vertical: false }`
  - `cursorProps: { stroke: 'var(--color-hairline-strong)' }` (line charts) and `barCursor: { fill: 'var(--color-surface-2)' }`
  - `SERIES: readonly string[]` = `['var(--color-chart-1)', …, 'var(--color-chart-5)']`
  - `sideColor(side: 'a' | 'b'): string`
- `ChartTooltip(props: TooltipContentProps & { formatLabel?: (l: unknown) => ReactNode; formatValue?: (v: number, name: string) => ReactNode })` — a bracketed mini panel, `font-data`, one row per series with its colour swatch.
- [ ] **Step 1: Implement** the two files.
- [ ] **Step 2: Migrate** every chart: delete each local `CustomTooltip`/`TOOLTIP_STYLE`, spread `axisProps`/`gridProps`, use `<Tooltip content={<ChartTooltip …/>} cursor={…}/>`. Team/driver series keep their payload colours.
- [ ] **Step 3: Verify** `grep -rnE "#[0-9a-fA-F]{3,6}|oklch\(" apps/web/components/charts apps/web/components/races/*chart*.tsx apps/web/components/races/pit-stop-analysis.tsx apps/web/components/best-seasons/competitiveness-chart.tsx apps/web/components/circuits/circuit-stats.tsx` → no hits (team colours arrive as data, not literals); `pnpm typecheck && pnpm lint && pnpm test && pnpm build`; visual check a 2024 race page (lap times, strategy, positions, gaps, degradation), `/drivers/max-verstappen`, `/best-seasons`.
- [ ] **Step 4: Commit** `feat(ui): shared chart theme and tooltip`.

### Task 5: Search returns seasons and races (backend)

**Files:**
- Modify: `pipeline/src/db/queries.py` (add two functions near `search_drivers`, line ~191)
- Modify: `pipeline/src/api/routers/search.py`
- Test: `pipeline/tests/test_search.py`

**Interfaces:**
- Produces (response, additive — existing keys unchanged): `"seasons": [{"year": int}]`, `"races": [{"year": int, "round": int, "name": str, "circuitName": str, "date": str | null}]`, empty arrays for a query below `SEARCH_MIN_LENGTH` (the early return gains both keys).
- `split_year(q: str) -> tuple[str, int | None]` in `search.py`: pulls one standalone 4-digit token between 1950 and 2100 out of the query; returns the remaining text stripped.
- `search_seasons(db, year: int) -> list[int]` — `[year]` if a `Season` row exists, else `[]`.
- `search_races(db, text: str, year: int | None, limit: int) -> list[Race]` — when `text` is non-empty, `ilike` on `Race.name`, `Circuit.name`, `Circuit.location`, `Circuit.country` (join circuit); filtered by `year` when given; when `text` is empty and `year` given, that year's races; ordered `season_year desc, round asc`; `limit=SEARCH_RESULT_LIMIT`. Escape `%`/`_` in `text` (use `ilike(pattern, escape="\\")`) — and apply the same escaping to the three existing searches.
- Drivers/constructors/circuits are searched with the year-stripped text when a year was present and text remains; with the full query otherwise.

- [ ] **Step 1: Write failing tests** (use `race_seed_data`: season 2023, round 1 "Bahrain Grand Prix" at circuit "Autodromo Nazionale di Monza", location "Monza", country "Italy"):
  - `test_search_year_returns_season`: `?q=2023` → `seasons == [{"year": 2023}]`, `len(races) == 1`, `races[0] == {"year": 2023, "round": 1, "name": "Bahrain Grand Prix", "circuitName": "Autodromo Nazionale di Monza", "date": "2023-03-05"}`.
  - `test_search_unknown_year`: `?q=1949` → `seasons == []`, `races == []`, status 200.
  - `test_search_race_by_name`: `?q=bahrain` → one race, round 1.
  - `test_search_race_by_circuit_and_year`: `?q=monza 2023` → one race; `?q=monza 2099` → `races == []`.
  - `test_search_wildcards_are_literal`: `?q=%25%25` and `?q=__` → every list empty.
  - `test_search_empty_query` / `test_search_short_query`: assert `seasons == []` and `races == []` too.
- [ ] **Step 2: Run** `cd pipeline && uv run pytest tests/test_search.py -v` → new tests FAIL.
- [ ] **Step 3: Implement** the three functions and the router changes.
- [ ] **Step 4: Run** `uv run pytest -v && uv run ruff check . && uv run ruff format --check .` → all pass.
- [ ] **Step 5: Commit** `feat(api): search finds seasons and races`.

### Task 6: Command palette

**Files:**
- Modify: `apps/web/lib/use-search.ts` (`SearchResults` gains `seasons`, `races`; `EMPTY` too)
- Create: `apps/web/lib/site-pages.ts`, `apps/web/lib/recently-viewed.ts`, `apps/web/lib/keyboard.ts`
- Create: `apps/web/components/layout/record-visit.tsx`
- Rewrite: `apps/web/components/layout/command-search.tsx`
- Test: `apps/web/lib/__tests__/site-pages.test.ts`, `recently-viewed.test.ts`, `keyboard.test.ts`

**Interfaces:**
- Consumes: Task 5 response shape; `Dialog` (Task 3).
- Produces:
  - `SITE_PAGES: readonly { title: string; href: string; keywords: string[] }[]` covering every route in the CLAUDE.md table except dynamic/noindex-only ones (include `/favourites`, `/status`, `/attributions`).
  - `searchPages(query: string, limit = 5): typeof SITE_PAGES[number][]` — case-insensitive match on title or any keyword, title-prefix matches first.
  - `RecentItem = { href: string; label: string; kind: 'driver' | 'constructor' | 'circuit' | 'season' | 'race'; color?: string | null }`
  - `recordVisit(item: RecentItem): void`, `readRecent(): RecentItem[]`, `useRecentlyViewed(): RecentItem[]` (same `useSyncExternalStore` + frozen server snapshot pattern as `lib/favourites.ts`), key `'f1-recently-viewed'`, newest first, deduped by `href`, max 6. Every storage access in `try/catch`; invalid JSON or non-array → `[]`.
  - `RecordVisit(props: RecentItem)` — client component, calls `recordVisit` in an effect, renders `null`. Used by Tasks 9 and 10.
  - `shortcutLabel(platform: string): string` → `'⌘K'` when `/mac|iphone|ipad/i`, else `'Ctrl K'`; computed client-side after hydration (`useHydrated()`), server renders `'⌘K'`-less "Search".
  - `isTypingTarget(target: EventTarget | null): boolean` → true for `input`, `textarea`, `select`, or `isContentEditable`.
  - Palette behaviour: opens on ⌘K/Ctrl+K anywhere and on `/` when `!isTypingTarget(e.target)`. Input has `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`, `aria-label="Search F1 Tracker"`; results `role="listbox"` of `role="option"` with groups (Pages, Seasons, Races, Drivers, Teams, Circuits); ↑/↓ move, Enter navigates, Escape closes. Empty query shows quick links: "Current season" (`/seasons/current`, the redirect route created in Task 7 — a 404 until then is expected), "Current standings" (same target, `#standings`), then recently viewed.
- [ ] **Step 1: Write failing tests**
  - `searchPages('rec')[0].href === '/records'`; `searchPages('best')` contains `/best-seasons`; `searchPages('zzz')` is `[]`; `searchPages('')` is `[]`.
  - recently viewed (use a fake `localStorage` on `globalThis`): record 7 distinct → `readRecent().length === 6` and newest first; recording an existing href moves it to the front without duplicating; `localStorage.getItem` returning `'{oops'` → `[]`; `getItem` throwing → `[]`; `setItem` throwing → `recordVisit` does not throw.
  - `isTypingTarget(document.createElement('input')) === true`, `textarea` true, `div` false, `div` with `contentEditable='true'` true (vitest `environment: 'jsdom'` for this file via `// @vitest-environment jsdom`; add `jsdom` dev dependency); `shortcutLabel('MacIntel') === '⌘K'`, `shortcutLabel('Win32') === 'Ctrl K'`.
- [ ] **Step 2: Run** `pnpm test` → FAIL. **Step 3: Implement.** **Step 4: Run** `pnpm test` → PASS.
- [ ] **Step 5: Manual keyboard check** (visual-check recipe): press `/` on `/drivers` → palette opens; focus the drivers filter input, press `/` → types a slash, palette stays closed; type `2021` → Seasons + Races groups; arrows + Enter navigate; Escape closes and focus returns to the trigger.
- [ ] **Step 6: Commit** `feat(search): command palette with seasons, races, pages and recents`.

### Task 7: Header, mobile nav, footer, current-season redirect

**Files:**
- Create: `apps/web/lib/nav.ts`, `apps/web/app/seasons/current/route.ts`
- Rewrite: `apps/web/components/layout/header.tsx`, `mobile-nav.tsx`, `nav-link.tsx`, `footer.tsx`, `breadcrumbs.tsx`
- Modify: `apps/web/app/layout.tsx` (header/footer/main use `Container`; skip link kept)

**Interfaces:**
- Produces:
  - `NAV_GROUPS: readonly NavGroup[]` with `type NavGroup = { label: string; href?: string; items?: readonly { label: string; href: string; description: string }[] }`, exactly: `Season` → `[Current season '/seasons/current', All seasons '/seasons', Champions '/champions', Best seasons '/best-seasons']`; `Drivers '/drivers'`; `Teams '/constructors'`; `Circuits '/circuits'`; `Stats` → `[Records '/records', Compare '/compare', Best seasons '/best-seasons']`.
  - `GET /seasons/current` route handler: fetches `api.seasons.list()` with `{ cache: 'no-store' }`, 307-redirects to `/seasons/<latest year>`; responds with `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400` so the CDN, not the Data Cache, absorbs it; on API failure redirects to `/seasons`. (Static segment wins over `[year]`.)
  - Header: skewed red logo lock-up (`Tag`-style), groups rendered at `lg` (≥1024px) — groups with `items` open a small Base UI popover/menu panel (Panel styling, keyboard accessible), active group underlined red; right side: palette trigger (Task 6) and a `Star` icon link to `/favourites` with `aria-label="Favourites"`. No `backdrop-blur`; solid `bg-surface-0` + `border-b border-hairline`.
  - Mobile (<1024px): `Sheet` from the bottom with the same groups.
  - Footer: every `NAV_GROUPS` destination + Favourites, Status, Attributions; trademark disclaimer and credits unchanged word for word.
- [ ] **Step 1: Implement**; `nav-link.tsx` active state via `usePathname()` prefix match.
- [ ] **Step 2: Verify** `pnpm typecheck && pnpm lint && pnpm test && pnpm build` (the build must still list `/seasons/[year]` as ISR and `/seasons/current` as dynamic); `curl -sI localhost:3000/seasons/current` → 307 to the latest season. Visual check header at 1024, 1440 and 390 widths; open each group with keyboard (Tab, Enter, arrows, Escape); `git diff apps/web/components/layout/footer.tsx` shows the disclaimer text unchanged.
- [ ] **Step 3: Commit** `feat(nav): grouped header, mobile sheet, full footer`.

### Task 8: Home page

**Files:**
- Rewrite: `apps/web/app/page.tsx`
- Create: `apps/web/components/home/next-race-panel.tsx`, `standings-panel.tsx`, `last-race-podium.tsx`, `explore-grid.tsx`
- Modify: `apps/web/components/favourites/favourites-summary.tsx` (restyle only)

**Interfaces:**
- Consumes: `Panel`, `Tag`, `Meter`, `SectionHeader` (Task 2), `Table` `highlight="leader"` (Task 3), `TrackLayout` SVG path convention `/tracks/<svgId>.svg` (the calendar round's `layoutSvgId`), `TitlePermutations` (existing), `SeasonCalendarMapWrapper` (existing).
- Data (keep `revalidate = 3600`; all fetches settled): existing `seasons.list`, `champions`, `seasons.driverStandings/constructorStandings/get/calendar(latestYear)`; **add** `races.get(latestYear, lastRace.round)` (podium), `seasons.permutations(latestYear)` (only render the panel while the title is undecided — use the response's own "decided" field), `bestSeasons.list()` (teaser = rank 1 season), `records()` (teaser = the top entry of most wins). Drop `stats()`.
- Layout: **Right now** — `NextRacePanel` (display-font race name, `Tag` "Round N of M", countdown via existing `NextRaceCountdown`, real track outline), `StandingsPanel` ×2 (top 5, leader row `highlight="leader"`, team bars, "Full standings" link), `LastRacePodium`, `FavouritesSummary` (only when the visitor has favourites — unchanged logic), title permutations when open. **Explore** — `ExploreGrid` of four `Panel` links with a live teaser line each: Best seasons (rank-1 season + its margin), Compare (`/seasons/<year>/compare?type=drivers` "<leader> vs <runner-up> this season"), Records (headline record), Champions (latest champion), plus the World Tour map section below. The full calendar table is removed.
- [ ] **Step 1: Implement.** Client components receive only the fields they draw.
- [ ] **Step 2: Verify** `pnpm typecheck && pnpm lint && pnpm test && pnpm build`; visual check `/` at 1440 and 390: no all-time count tiles, no calendar table, Explore teasers link correctly, map still mounts and plays.
- [ ] **Step 3: Commit** `feat(home): right-now and explore sections`.

### Task 9: Driver, constructor and circuit detail pages (livery)

**Files:**
- Create: `apps/web/components/layout/where-next.tsx`
- Modify: `apps/web/lib/livery.ts` (add `latestTeamColor`), `apps/web/lib/__tests__/livery.test.ts`
- Modify: `apps/web/app/drivers/[ref]/page.tsx`, `apps/web/app/constructors/[ref]/page.tsx`, `apps/web/app/circuits/[ref]/page.tsx`, plus their child components: `components/drivers/season-history-table.tsx`, `components/constructors/{season-history-table,lineage-timeline}.tsx`, `components/circuits/{circuit-stats,track-layout}.tsx`, `components/favourites/favourite-button.tsx`
- Remove the inline FastestLapCard copy in `app/circuits/[ref]/page.tsx:187-206` → use `components/races/fastest-lap-card.tsx`

**Interfaces:**
- Consumes: `PageHero` (`livery`, `watermark`), `Meter`, `Panel`, `RecordVisit` (Task 6), `buttonVariants` `livery` variant.
- Produces:
  - `latestTeamColor(seasons: readonly { year: number; constructor: { color: string | null } | null }[]): string | null` — the constructor colour of the max-`year` season (order-independent); `null` if that season has no constructor or no colour (no fallback to older teams — owner's decision: most recent team or red).
  - `WhereNext(props: { links: readonly { label: string; href: string; description?: string }[] })` — a row of `Panel` links at the bottom of a detail page; renders nothing for an empty list.
- Page decisions: driver hero = display name, car number as `watermark`, `Tag`s (team, nationality), win/podium rate `Meter`s, `livery = latestTeamColor(seasons)`; WhereNext → "Compare with <teammate>" (`/compare/drivers?d1=<ref>&d2=<teammate ref>` using the latest season's teammate if the page has it, else `/compare/drivers?d1=<ref>`), "<latest year> in-season comparison" (`/seasons/<year>/compare?type=drivers&a=<ref>`). Constructor hero livery = its own `color`; WhereNext → `/compare/constructors?c1=<ref>`, in-season comparison. Circuit page: red accent, real track outline in the hero; WhereNext → latest race there, its season. Each page renders `<RecordVisit …/>`.
- [ ] **Step 1: Failing tests:** `latestTeamColor([{year:2025,constructor:{color:'#111'}},{year:2026,constructor:{color:'#00D7B6'}}]) === '#00D7B6'` (unsorted input works); latest season colour `null` with older coloured → `null`; `[]` → `null`; latest `constructor: null` → `null`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** helper, then pages. **Step 4: Run** `pnpm test` → PASS.
- [ ] **Step 5: Verify** `pnpm typecheck && pnpm lint && pnpm build`; visual check `/drivers/kimi-antonelli` (teal), `/drivers/lewis-hamilton` (latest team colour), a 1950s driver whose team is uncoloured (red fallback, nothing grey or broken), `/constructors/mercedes`, `/circuits/monza`.
- [ ] **Step 6: Commit** `feat(ui): livery detail pages with where-next links`.

### Task 10: Season and race pages, edge navigation, loading states

**Files:**
- Create: `apps/web/lib/neighbours.ts`, `apps/web/lib/__tests__/neighbours.test.ts`
- Modify: `apps/web/app/seasons/[year]/page.tsx`, `apps/web/app/seasons/[year]/races/[round]/page.tsx`, their components in `components/races/*`, `components/standings/*`, `components/seasons/{scoring-note,title-permutations,normalised-standings}.tsx`, `components/best-seasons/season-rank-badge.tsx`
- Rewrite: `apps/web/app/seasons/loading.tsx`, `app/seasons/[year]/loading.tsx`, `app/seasons/[year]/races/[round]/loading.tsx` (no nested `<main>`, no own container — the layout's `Container` already wraps them)

**Interfaces:**
- Produces:
  - `FIRST_SEASON = 1950`
  - `seasonNeighbours(year: number, currentYear: number): { prev: number | null; next: number | null }` — `prev = year > FIRST_SEASON ? year - 1 : null`; `next = year < currentYear ? year + 1 : null`. The page passes `new Date().getUTCFullYear()` (output only changes on 1 Jan, like `cacheScopeFor`'s TTL choice).
  - `roundNeighbours(round: number, totalRounds: number): { prev: number | null; next: number | null }` — `prev` when `round > 1`, `next` when `round < totalRounds`; `totalRounds <= 0` → both null.
- Season page: `PageHero` with year in display font, `Tag` round count, prev/next as `buttonVariants('outline')` links with `aria-label="<year> season"` (only when non-null), `SeasonRankBadge`, compare action; standings tables with leader `highlight`; WhereNext → season compare, best-seasons rank (`/best-seasons#<year>` or the existing rank link). `RecordVisit kind="season"`.
- Race page: add `api.seasons.get(year)` to its `Promise.allSettled` (season-tagged, allowed) for `totalRounds`; hero = race name in display font, `Tag` "Round N", circuit name **linked** to `/circuits/<race.circuit.ref>`; podium panel (three bracketed columns in team colours); results table winner row `highlight="leader"`; prev/next round links via `roundNeighbours`; WhereNext → circuit, `/seasons/<year>/compare?type=drivers&a=<P1 ref>&b=<P2 ref>`. `RecordVisit kind="race"`.
- `normalised-standings.tsx`: replace `--pos-gain`/`--pos-loss` with `text-positive`/`text-negative`.
- [ ] **Step 1: Failing tests:** `seasonNeighbours(1950, 2026)` → `{prev:null,next:1951}`; `seasonNeighbours(2026, 2026)` → `{prev:2025,next:null}`; `seasonNeighbours(1990, 2026)` → `{prev:1989,next:1991}`; `roundNeighbours(1, 23)` → `{prev:null,next:2}`; `roundNeighbours(23, 23)` → `{prev:22,next:null}`; `roundNeighbours(1, 0)` → `{prev:null,next:null}`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `pnpm test` → PASS.
- [ ] **Step 5: Verify** `pnpm typecheck && pnpm lint && pnpm build`; visual check `/seasons/1950` (no prev arrow), `/seasons/2026` (no next arrow), `/seasons/2025/races/1` (no prev round, circuit linked), the last round of 2025 (no next), a race with sprint + Fast-F1 data (all tabs), and navigate to each season/race route while throttled to see the loading skeleton line up with the page (no jump).
- [ ] **Step 6: Commit** `feat(ui): season and race pages, edge-safe navigation`.

### Task 11: List and index pages

**Files:**
- Modify: `apps/web/app/seasons/page.tsx`, `app/drivers/page.tsx`, `app/constructors/page.tsx`, `app/circuits/page.tsx`, `app/champions/page.tsx`, `app/favourites/page.tsx`, `app/attributions/page.tsx`, `app/status/page.tsx`, `app/not-found.tsx`, `app/error.tsx` (and the other `error.tsx`/`loading.tsx` files), `components/pagination.tsx`, `components/list-filter.tsx`, `components/error-boundary.tsx`, `components/favourites/favourites-view.tsx`, `components/ops/time-ago.tsx`, `components/circuits/world-map-wrapper.tsx`
- Create: `apps/web/app/favourites/loading.tsx`, `app/status/loading.tsx`, `app/attributions/loading.tsx`

**Interfaces:**
- Consumes: everything from Tasks 2–3.
- Decisions: season tiles = `Panel`s with the year in display font and the champion with a team bar (`prefetch={false}` kept); driver/constructor lists = readout tables or compact panels with team bars; champions = readout table with gold tokens (no `amber-*`); every page uses `PageHero` (eyebrow = section, e.g. "Archive · 1950–2026"). `/status` keeps its data honesty rules (counts, timestamps, revision ids only).
- [ ] **Step 1: Implement.**
- [ ] **Step 2: Verify** `pnpm typecheck && pnpm lint && pnpm test && pnpm build`; visual check each route at 1440 and 390.
- [ ] **Step 3: Commit** `feat(ui): list and utility pages`.

### Task 12: Comparison, records and best-seasons tools

**Files:**
- Modify: `app/compare/page.tsx`, `app/compare/drivers/page.tsx`, `app/compare/constructors/page.tsx`, `app/seasons/[year]/compare/page.tsx`, `app/records/page.tsx`, `app/best-seasons/page.tsx`
- Modify: `components/compare/*`, `components/season-compare/*` (incl. `sides.ts`), `components/records/records-explorer.tsx`, `components/best-seasons/{best-seasons-table,score-breakdown-bar,season-podium}.tsx`

**Interfaces:**
- Consumes: `sideColor()` (Task 4), `side-a`/`side-b` tokens (Task 1).
- Decisions (spec, Claude's call): each side keeps its team colour exactly as `sides.ts` computes today (teammates' shared livery tinted lighter for B); `side-a`/`side-b` tokens are used only when a side has no colour or both resolve to the same colour after tinting, and replace `text-blue-500` in `head-to-head-card.tsx:50,68` and `career-stats-table.tsx:57`. The compare pages get a two-column hero with each side's livery as its bracket accent. `score-breakdown-bar.tsx` hex colours → chart tokens.
- [ ] **Step 1: Implement.**
- [ ] **Step 2: Verify** `pnpm typecheck && pnpm lint && pnpm test && pnpm build`; visual check `/compare/drivers?d1=kimi-antonelli&d2=george-russell` (teammates: B tinted), `/compare/constructors?c1=ferrari&c2=mclaren`, `/seasons/2026/compare`, `/records` (filters still URL-sync), `/best-seasons` (sort still works).
- [ ] **Step 3: Commit** `feat(ui): comparison, records and best-seasons tools`.

### Task 13: Maps

**Files:**
- Create: `apps/web/lib/map-theme.ts`
- Modify: `apps/web/components/seasons/season-calendar-map.tsx`, `season-calendar-map.module.css`, `season-calendar-canvas.tsx` (colours only — keep the `calendar-land` pane and `landOptions`), `season-calendar-map-wrapper.tsx` (placeholder skeleton), `apps/web/components/circuits/world-map.tsx` (colours only — keep the `circuits-land` pane)

**Interfaces:**
- Produces `lib/map-theme.ts`: `LAND = { fillColor, color, weight }`, `OCEAN`, `ROUTE`, `TRAVELLED`, `ACTIVE`, `PIN` constants — the only colour literals allowed outside `components/seo` (Leaflet `pathOptions` cannot read CSS variables). Values: land `oklch(0.16 0.006 250)`-equivalent hex, ocean = surface-0, routes in brand red.
- Decisions: behaviour untouched. Frame = `Panel` brackets; km counter and current-leg readouts in `font-data`; the scrubbable timeline rendered as a segmented meter (keep its existing input/ARIA semantics — restyle, don't replace the control); round card tinted with the winner's team colour via `liveryStyle`; play/prev/next/speed controls = `buttonVariants('outline')` icon buttons with `aria-label`s; tooltips styled as mini panels. `prefers-reduced-motion` behaviour unchanged.
- [ ] **Step 1: Implement.**
- [ ] **Step 2: Verify** `pnpm typecheck && pnpm lint && pnpm test && pnpm build`; visual check `/seasons/2025` calendar section: travel lines still drawn **above** land (inspect: land paths in `.leaflet-calendar-land-pane` z-index 250), playback, scrubbing, keyboard focus on markers; `/` World Tour intro; `/circuits` map pins above land.
- [ ] **Step 3: Commit** `feat(ui): telemetry map styling`.

### Task 14: Legacy sweep, accessibility and docs

**Files:**
- Modify: `apps/web/app/globals.css` (delete the LEGACY block: `.glass`, `.glow-border`, `.card-glow`, `.glow-red`, `.speed-lines`, `.accent-line`, `.text-gradient`, `.pos-1..3`, `--glass-*`, `--glow-primary`, `--gradient-*`, unused `--sidebar-*`, `scan-line`/`glow-pulse`/`shimmer` keyframes if unused)
- Modify: any file the audit greps below still flag
- Modify: `apps/web/components/ui/motion.tsx` (confirm every export honours reduced motion; check `HeroGlow` — delete it if unused after Task 8)
- Modify: `CLAUDE.md` (frontend component inventory: `components/ui` list, new `components/home`, `lib/{chart-theme,livery,meter,nav,neighbours,site-pages,recently-viewed,keyboard,map-theme}.ts`, `/seasons/current`, Vitest + `pnpm test`; remove the nonexistent theme provider/toggle; add a "Design system" convention paragraph: tokens in `@theme`, `Panel`/`PageHero`/chart theme are the only way, livery = most recent team via `latestTeamColor`, no literals outside `components/seo` and `lib/map-theme.ts`)
- Optional last: `apps/web/components/seo/og-card.tsx` chrome to the new look (grid, brackets, Barlow via a fetched font file), keeping `satoriText()` on every dynamic string

**Interfaces:** none new.
- [ ] **Step 1: Run the audits** (from `apps/web`), each must print nothing:
  - `grep -rnE "glass|glow-|card-glow|speed-lines|accent-line|text-gradient|pos-[123]\b|backdrop-blur|font-heading|font-mono|surface-1\)\]|var\(--glass" app components`
  - `grep -rnE "#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|oklch\(" app components lib --include='*.tsx' --include='*.ts' | grep -vE "components/seo/|lib/map-theme.ts|opengraph-image|twitter-image"`
  - `grep -rnE "\b(text|bg|border)-(red|blue|green|amber|purple|zinc|gray|neutral|orange|white|black)-[0-9]{2,3}" app components`
  - `grep -rnE "text-\[1[01]px\]|text-muted-foreground/[2-6]0" app components`
- [ ] **Step 2: Fix** every hit (tokens, `.label`, `text-2xs`). Add `.focus-ring` to any remaining hand-styled interactive element (`grep -rn "<Link" app components | grep -v buttonVariants` and inspect the ones with custom classes).
- [ ] **Step 3: Verify** `pnpm typecheck && pnpm lint && pnpm test && pnpm build && npx prettier --check .`; `cd ../../pipeline && uv run pytest`; full visual pass over every route in the CLAUDE.md table at 1440 and 390 with reduced motion emulated once (`browser_emulate_media`), checking no console errors.
- [ ] **Step 4: Commit** `refactor(ui): remove legacy styles, a11y sweep, update CLAUDE.md`.
