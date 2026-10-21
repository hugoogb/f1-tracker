# UI/UX overhaul — "Telemetry" design

Date: 2026-10-21 · Scope: `apps/web` (plus one backend search change)

## Intent

F1 Tracker covers 1950–present with tools no other F1 site has (best seasons,
in-season comparison, title permutations, cross-era scoring, the calendar map),
but they are hard to find and the UI looks generic: glassmorphism and glow on
every card, Orbitron capitals everywhere, a long stack of equal-weight cards.
Under the surface the design system is half-wired — tokens that bypass Tailwind,
14 charts each styling themselves, headers and stat blocks rebuilt per page.

The owner (a software engineer, who knows the site inside out) wants a full
upgrade and is willing to lose everything except the F1 colours. The goal is a
site that looks like an engineer's telemetry screen with a little broadcast
flair, where a first-time visitor finds the distinctive features within a
minute, and that is built on shared tokens and components so it stays
consistent.

## Goals

1. A new visual language — **telemetry-led, broadcast-accented, livery-aware** —
   applied to every route.
2. A real design system: every colour, font, surface and chart style comes from
   tokens; shared components replace per-page copies.
3. Discoverability: grouped navigation visible on laptops, a search that finds
   everything, a home page that surfaces the distinctive tools, and no dead-end
   pages.
4. Fix the bugs the audit found along the way (listed below).

## Non-goals

- No light mode. The site stays dark-only (`className="dark"` stays). *(Builder's
  note: Claude's call, agreed implicitly; the look is designed for the dark.)*
- No new data, endpoints or features beyond the search extension below.
- No change to what the calendar map *does* (playback, flights, timeline) — only
  how it looks.
- No change to caching strategy, SEO plumbing or data correctness rules in
  `CLAUDE.md`.

## Anti-goals (failure even if it "works")

- Looking like a generic shadcn/Vercel dashboard again.
- Broadcast flair everywhere — it must stay an accent (titles, tags, the
  leader/winner slab, logo), or the site becomes loud and hard to read.
- Reintroducing hard-coded colours, a second team palette, or per-chart styling.
- Breaking any rule in `CLAUDE.md` (cache determinism, no images/logos, no tile
  layers, `useNow()` for clock-dependent output, footer disclaimer, etc.).

## Visual language (decided)

Validated with throwaway mockups during brainstorming (since deleted). Chosen:
"Telemetry-led" — HUD panels on a grid carry all content; broadcast styling is
limited to headlines, skewed tags and the leader/winner slab. Rejected along
the way: a pure broadcast look, a flat timing-tower look, an editorial serif
look, a light "poster" look and a bento-tile look.

**Surfaces**
- Near-black background with a faint blueprint grid (≈24px, ~2–4% white lines)
  on the page body.
- Content lives in **Panels**: flat, near-black, 1px hairline border, with
  **corner brackets** (2px L-shapes top-left and bottom-right) in the accent
  colour. No glassmorphism, blur, glow or drop shadows.
- Hierarchy comes from hairlines, dashed row separators and spacing — not
  elevation. Radius is small or zero (square, technical).

**Type** (three families, one job each, all via `next/font/google`)
- **Barlow Condensed**, italic 800, uppercase — page titles, hero names and hero
  numbers only (display).
- **Chakra Petch** — labels, eyebrows, nav, numbers, tables, readouts (tabular
  numerals). Labels are small uppercase with wide letter-spacing.
- **Titillium Web** — body copy.
- Removes Orbitron, Plus Jakarta Sans and JetBrains Mono.

**Colour**
- **F1 red** (`#E10600` family) is the brand and the "current" signal: active
  nav, leader/winner row, default bracket colour, primary actions.
- **Livery**: a page about one driver or constructor takes that team's colour
  (from the backend palette — never a frontend palette) as its accent: brackets,
  meters, chart series, the car-number/initials badge. Implemented as a CSS
  variable (`--livery`) set on the page's root element; components read
  `var(--accent)` which defaults to red. Elsewhere team colour appears as a thin
  bar on each row.
- *Driver livery (owner's decision):* a driver page uses the colour of the
  driver's **most recent team** — the constructor of their latest season, read
  from the `/drivers/{ref}/seasons` payload the page already fetches (no backend
  change). Season-history rows keep each year's own team colour. A driver with
  no coloured team falls back to red.
- Semantic tokens to add: fastest lap (purple), gold/silver/bronze (one podium
  palette, replacing the two that exist), comparison side A/B, tyre compounds
  (moved out of `lib/constants.ts` hex), positive/negative (gain/loss).
- *Comparison colours (Claude's call):* team colours stay the primary identity
  of each side, exactly as `season-compare/sides.ts` does today (teammates'
  shared livery tinted lighter for side B). The side A/B tokens are the
  fallback only — when a side has no colour or the two collide — and replace
  the hard-coded `text-blue-500` on the `/compare` pages.

**Broadcast accents (sparingly)**
- Skewed tags (round number, "Next", "Compare →" CTA).
- The red skewed **slab** on a leader or winner row inside an otherwise
  telemetry table.
- The skewed red logo lock-up.

**Telemetry motifs**
- Segmented meters (slightly skewed segments) for rates and progress.
- Track outlines as graphics — the real f1db circuit SVGs already served
  (`TrackLayout`), never hand-drawn shapes.
- Readout tables: Chakra Petch, dashed separators, tabular numbers, team bar.
- Podium panel on race pages.

## Design system (decided)

- **Tokens** in `app/globals.css`, all registered in `@theme` so they are real
  Tailwind utilities (no `bg-[var(--…)]` workarounds): surfaces, hairline,
  grid, accent/livery, semantic colours above, chart colours, font families, a
  small type step for labels (replacing `text-[10px]`/`text-[11px]`).
- **One chart theme** (`lib/chart-theme.ts` or similar) providing axis, grid,
  cursor, tooltip and series styles from the tokens, and one shared chart
  tooltip component. Every Recharts chart uses it; no colour literals in chart
  files.
- **shadcn**: keep and restyle the interactive Base UI-backed primitives
  (Tabs, Select, Dialog, Sheet, Button). Add a keyboard-navigable command
  list for search on the same foundations (proper combobox/listbox roles).
  Replace `Card` with a new `Panel`; restyle `Table`, `Badge` (→ tag) and
  `Skeleton` to the new look. Delete unused `dropdown-menu` and `separator`.
- **Shared building blocks** replacing per-page copies: `Panel`, readout row /
  table styling, `Meter`, `SectionHeader` (eyebrow + title + "view all"
  action), `PageHero` (one header for list and detail pages, with livery,
  badge, tags, actions and favourite button — replacing the 6 hand-built detail
  headers and the existing `PageHeader`), `Container`, `Tag`, and
  `buttonVariants` used for button-styled links. `StatCard` and `EmptyState`
  are restyled and used where inline copies exist today.

## Navigation and discoverability (decided)

**Header**
- Grouped top level, visible from laptop widths (≈1024px), not only ≥1280px:
  - *Season* — current season, all seasons, champions, best seasons
  - *Drivers*, *Teams*, *Circuits*
  - *Stats* — records, compare, best seasons
- Right side: ⌘K search (shortcut label adapts to platform; `/` also opens it)
  and a favourites star linking to `/favourites`.
- Mobile: the same groups in a bottom sheet.

**Search** (command palette)
- Finds drivers, constructors, circuits (as now) **plus seasons** ("2021"),
  **races** ("Monaco 2021") and **pages** ("records").
- Empty state shows quick links: next race, current standings, recently viewed
  (recently viewed stored in localStorage, like favourites).
- *Builder's note (Claude's call):* races and seasons come from extending
  `GET /api/search` on the backend (with tests), pages are a static client-side
  list. Keep search fetches uncached (`no-store`) as the query space is
  unbounded.

**Home page**, two parts:
1. *Right now* — next race (countdown, real track outline), top of both
   championships, last race podium; title permutations panel when the title is
   still open.
2. *Explore* — panels for Best Seasons, Compare, Records and the World Tour map,
   each with a live teaser rather than a bare link (e.g. the closest title
   fight, the top-two drivers' comparison this season, one headline record).
- The full calendar table is removed from home (the map covers it).
- *What else happens to today's home (Claude's call):* the favourites summary
  stays, in *Right now*, shown only when the visitor has favourites. The recent
  champions strip becomes a Champions teaser in *Explore*. The all-time count
  tiles (seasons, drivers, teams, circuits) are dropped — they describe the
  database, not the sport.

**No dead ends** — every detail page ends with "where next" links:
- Race → its circuit, previous/next round, compare the top two.
- Driver → compare with teammate, in-season comparison.
- Constructor → compare (missing today), in-season comparison.
- Season → its comparison page, its best-seasons rank.

**Footer** lists every main section (adds Records, Best Seasons, Compare) and
keeps the trademark disclaimer and data credits untouched.

## Calendar map (decided: look only)

Behaviour unchanged. Telemetry treatment: bracket frame, Chakra Petch readouts
(km travelled, current leg), the playback timeline as a segmented meter, round
card tinted with the winner's team colour, controls restyled. The land-pane fix
(travel lines drawn on top of land) is already made in
`season-calendar-canvas.tsx` and `circuits/world-map.tsx` and must be kept.

## Bugs to fix along the way (decided)

- Season prev/next arrows link to non-existent seasons (1949, next year); also
  need `aria-label`s.
- Race page: circuit name not linked; no prev/next round.
- `normalised-standings.tsx` reads undefined `--pos-gain`/`--pos-loss`.
- Three `loading.tsx` files render a nested `<main>` with a different container,
  so the page jumps on load.
- Search input has no accessible name / listbox semantics.
- Hand-styled links/buttons lack `focus-visible` rings.
- Low-contrast text (`text-muted-foreground/40–60`, 10px chart ticks).
- `CLAUDE.md` mentions a theme provider and toggle that don't exist; update it,
  and its component inventory, to match the new system.

## Constraints

- Everything in `CLAUDE.md` still applies, notably: deterministic cached output
  (no render-time timestamps/randomness), pass client components only the fields
  they draw, `prefetch={false}` on heavy list links, `useNow()`/`LocalDate` for
  clock-dependent output, `buildMetadata()` for page metadata, team colours only
  from the backend payload via `teamColorOf()`, no driver photos or team logos,
  no map tiles, the footer disclaimer and `/attributions` stay.
- Any new home-page data must respect the cache-tag rules (`cacheScopeFor`): the
  home page may read `f1-global` endpoints; per-season/per-entity pages must not.
- `prefers-reduced-motion` respected for every new animation.
- Fonts via `next/font` only (no new runtime CSS dependencies).
- CI must keep passing: format, lint, typecheck, build, backend tests.

## Left to the builder

- Exact token values (grid opacity, hairline shades, spacing scale), as long as
  they match the mockups' feel.
- Component APIs and file names (suggested names above are not binding).
- Order of work and how it's split into commits/PRs.
- How each individual page is laid out within the system (the mockups show
  home, driver and race; apply the same language to the rest).
- Whether OG image cards (`components/seo/og-card.tsx`) adopt the new look —
  nice to have, do last.
- Motion details (subtle, short, reduced-motion safe).
