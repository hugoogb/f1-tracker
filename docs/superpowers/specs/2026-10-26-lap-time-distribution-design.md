# Lap time distribution — design

## Intent

Bring the "Lap Time Distribution" chart (violin per driver, one dot per lap coloured by tyre,
median diamond, dashed median connector, "+x.xxx" behind the fastest median underneath; reference:
a TrackSims graphic of the 2026 Austin race) into F1 Tracker, for drivers **and** constructors, and
extend the same visual language from one race to whole seasons and careers.

It answers three questions the site cannot answer today:

1. **In this race**, who had the real pace once pit stops and traffic are taken out, and how
   consistent were they? (Race page)
2. **Over a season**, who was fastest overall? (Season page) And how did two drivers' or two
   teams' pace change round by round? (In-season compare)
3. **Over a career**, how competitive was this driver or this team, year by year? (Profiles)

## Goals

- One reusable violin chart, five placements:

  | Where | Columns | Scale | Dots |
  |---|---|---|---|
  | `/seasons/[year]/races/[round]` | drivers, or teams (toggle) | lap time (m:ss.s) | one per lap, tyre colour |
  | `/seasons/[year]` | drivers, or teams (toggle) | % of race benchmark | one per race (that entity's race median) |
  | `/seasons/[year]/compare` | rounds; A and B as two half-violins per round | % of race benchmark | none, or one per side per round (builder's call) |
  | `/drivers/[ref]` | seasons (2018+) | % of race benchmark | none, or one per race (builder's call) |
  | `/constructors/[ref]` | seasons (2018+) | % of race benchmark | none, or one per race (builder's call) |

- Columns ordered fastest median first on the race and season charts; chronological on the
  compare (by round) and profile (by season) charts.
- Under each column: the entity (initials avatar / constructor initials + flag, per the existing
  `DriverAvatar`/`ConstructorLogo`/`CountryFlag`) and its median gap to the fastest column —
  "+0.247" seconds on the race chart, "+0.42%" on the percentage charts. The fastest shows
  0.000 / 0.00%.
- Legend: median diamond, violin outline, median connector, and (race chart) the tyre colours.
- Every chart states its coverage: clean laps vs total laps (race), "N of M races with lap data"
  (season, compare, each profile season).

## Non-goals

- No pre-2018 data. Lap times come from Fast-F1 only; the charts render an empty state with the
  reason before 2018 or for races with no lap times imported.
- No new data ingestion, no new tables, no migration.
- No qualifying or sprint lap distribution, only the Grand Prix.
- No season picker on the profile pages (clicking a season column goes to the compare page
  instead, see below).

## Anti-goals (would make this a failure even if it technically works)

- **Driver photos or team logos.** The reference uses headshots; we must not (Licensing section of
  `CLAUDE.md`). Initials avatars and flags only.
- **Raw lap times pooled across circuits.** A 1:40 at Austin and a 1:12 at Austria are not
  comparable; any multi-race chart that pools seconds is measuring the calendar. All multi-race
  charts use the percentage scale.
- **Pit and safety-car laps stretching every violin.** One 2-minute in-lap flattens the whole
  chart. The clean-lap filter is mandatory everywhere.
- **Blowing the Vercel cache budget.** No raw per-lap season data in a cached page; no new
  `f1-global` read from a per-season or per-entity page; deterministic output only.
- Hex/oklch literals in components, or a second palette. Tyre colours are the existing
  `tyre-*` tokens; team colours come from the payload via `teamColorOf()`.

## Definitions (shared by every chart)

- **Clean lap** — `lap_number > 1`, `time_millis` not null, and
  `time_millis <= 1.07 × median(every timed lap of that race after lap 1)`. This is the
  definition `season_compare.py`'s race pace already uses (the degradation endpoint differs
  slightly: it takes the median only over laps with a compound and tyre age — it is left as it
  is). Reuse the existing 1.07 constant (`_CLEAN_LAP_THRESHOLD`); do not invent a second
  threshold. *(My call — the browser only has lap time and compound, so this is the definition
  both sides can reproduce exactly.)* On the race
  page this filter runs in the browser on the laps the page already has, so the threshold also
  needs a TS twin (same "change both or neither" note as `geo.py`/`geo.ts`).
- **Minimum laps** — a driver (or team) needs at least `SEASON_COMPARE_MIN_CLEAN_LAPS` (5) clean
  laps in a race to get a column / to count for that race. Excluded entities are listed under the
  race chart ("Not shown: STR (3 clean laps)"), so a DNF never silently disappears.
- **Constructor laps** — a lap belongs to the constructor the driver raced for in that race
  (from the race result). Both drivers' laps pool into one violin.
- **Race benchmark** — the fastest median clean-lap time of any *driver* meeting the minimum in
  that race. One benchmark per race, used by both the driver and the team charts, so a team's
  % is comparable with a driver's.
- **Season qualification** — on the season chart an entity needs to have met the per-race
  minimum in at least half of the season's races with lap data; the rest are listed under the
  chart ("Not shown: … (3 of 22 races)"). Ordering and the "+x.xx%" label use the **median of
  that entity's per-race medians**, so every race weighs the same whatever its lap count; the
  violin is still drawn over all of its clean laps, and only laps from races where it met the
  minimum count. *(My call — stops a one-race stand-in in a fast car topping "who was fastest
  overall".)*
- **Lap %** — `100 × lap_time / race_benchmark`. 100.00 = the benchmark pace; 101.20 = 1.2%
  slower. The axis reads in %; labels read as "+x.xx%" (`% − 100`).
- **Density outline** — Gaussian kernel density estimate. Bandwidth by Silverman's rule; the
  outline is evaluated on a fixed grid of points spanning the column's min to max (plus a small
  pad) and scaled so every column has the same maximum width (shape, not area, is what is
  compared). The exact grid size is the builder's call (~40–60 points).

## Stages

Three stages, each shippable on its own and each its own PR.

### Stage 1 — race chart + the shared violin component

- **No backend change.** The race page already fetches `/laps` and passes `chartLaps()` to client
  charts. Extend `ChartDriverLaps` with only what this needs: the constructor's `ref` and `name`
  (for team mode), plus the driver's nationality and the constructor's country code for the
  flags under each column (two short strings per driver). Keep `chartLaps()` otherwise minimal;
  it is stored twice per cached page. *(My call — flags kept, at a cost of a few hundred bytes.)*
- **Placement** — alongside the existing lap-based charts in the race page's tabs. The builder
  chooses whether it is its own tab or a section in the tab that holds the lap-times chart;
  either way it is a client component, rendered only when lap data exists.
- **Toggle** — Drivers / Constructors, client state (not URL; the page is cached).
- **Computation in the browser**, in a pure module (`lib/lap-distribution.ts` or similar):
  clean-lap filter, medians, quartiles, KDE, ordering, gaps. Vitest unit tests for each.
- **Dots** — one per clean lap, tyre-coloured (`tyre-*` tokens; unknown compound →
  `tyre-unknown`), jittered horizontally inside the violin's width at that y so they read as a
  swarm. Jitter must be deterministic (seeded from lap number / driver ref, never `Math.random`),
  so the server and client renders agree and the chart does not reshuffle on re-render.
- **Violin fill** — team colour at low opacity via `color-mix(...)` (never a hex alpha suffix),
  hairline outline in the same colour.
- **Hover** — a dot shows driver, lap number, lap time, compound; a column shows median, IQR,
  clean laps.
- **Mobile** — 20+ columns will not fit; the chart scrolls horizontally with a minimum column
  width, the y-axis sticky if practical. Builder's call on the exact behaviour.
- **Rendering** — Recharts has no violin; the component is a hand-built SVG
  (`components/charts/violin-chart.tsx`) that spreads its axis/grid styling from
  `lib/chart-theme.ts` and uses `TooltipFrame` for hover. It takes columns already reduced to
  `{ key, label, color, median, q1, q3, density: [{y, w}], dots?: [{y, color, meta}] }` plus an
  axis formatter, so the same component serves seconds and %. Split (half) violins for the
  compare chart are a prop on the same component, not a second component.

### Stage 2 — season ranking + in-season compare

Backend computes everything; the browser only draws.

- **`GET /api/seasons/{year}/lap-pace?type=drivers|constructors`**
  - Per entity: `{ ref, name, code?, color, races (count), cleanLaps, medianPct, q1Pct, q3Pct,
    density: [{pct, w}], raceMedians: [{round, pct}] }`, ordered by `medianPct`.
  - The column's violin and quartiles are over all of that entity's clean laps as %; the dots are
    `raceMedians` (one per race), so the payload stays ~20 columns × (grid + ~24) numbers.
  - `coverage: { racesWithLaps, racesHeld }`.
  - Under `/seasons/{year}`, so `cacheScopeFor` scopes it to `f1-season-<year>` with no change.
- **`GET /api/seasons/{year}/compare/lap-pace?type=drivers|constructors&a=&b=`**
  - Per round held so far: `{ round, raceName, a: {medianPct, q1Pct, q3Pct, density, cleanLaps} |
    null, b: {…} | null }`. A side is null when it did not meet the minimum that round (or the
    race has no lap data); the chart shows an empty slot, not a zero.
  - Same 404/400 rules as the existing season compare endpoints. Fetched `no-store` (unbounded
    pair space), like the other compare endpoints.
- **Season page** — new section with the Drivers / Constructors toggle. Server-fetched in
  `Promise.allSettled` with the rest of the page; a failure hides the section, never the page.
  Fetch both `type`s or fetch on toggle: the builder decides, mindful that both payloads end up
  in the cached page if fetched server-side.
- **Compare page** — new section "Race pace by round": per round, A's half-violin on the left in
  A's colour, B's on the right in B's colour (`season-compare/sides.ts`, including the lighter
  tint for teammates), medians connected per side across rounds.
- **The existing "Race pace" stat row stays as it is** (gap relative to the faster side, only
  rounds where both sides qualify). The new section's caption says its % is against each race's
  benchmark (the fastest driver that day), so the two figures are not read as the same measure.
  *(My call — changing the row would change an existing API field for no reader benefit.)*
- Shared Python helper (e.g. `src/api/lap_pace.py`): clean-lap filter, benchmark, %, KDE,
  quartiles. Unit-tested directly plus endpoint tests. It must agree with the TS module's
  definitions; the KDE maths existing twice is deliberate (the race chart has raw laps and needs
  no endpoint), and the two get a "change both or neither" note like `geo.py`/`geo.ts`.

### Stage 3 — profiles

- **`GET /api/drivers/{ref}/lap-pace`** and **`GET /api/constructors/{ref}/lap-pace`** (not `/pace`,
  which already exists on drivers for qualifying-vs-race).
  - Per season from 2018 in which the entity has lap data: `{ year, color, constructor? (driver
    only: the team they raced for most that year, `main_constructors()`), races, racesHeld,
    cleanLaps, medianPct, q1Pct, q3Pct, density }`.
  - Entity-scoped by `cacheScopeFor` with no change.
- **Chart** — one column per season, chronological, each tinted to that season's team colour
  (driver) or the constructor's colour. A driver's team switch therefore shows as a colour change.
- **Click a season column** → `/seasons/{year}/compare?type=drivers|constructors&a=<ref>` (the
  compare page fills `b` itself from the standings). Links set `prefetch={false}`.
- Hidden entirely for an entity with no 2018+ lap data.

## Constraints from the codebase (non-negotiable)

- Design tokens only; `display`/`label`/`font-data` typography; `Panel`/`SectionHeader` chrome.
- Clock-, locale- and timezone-dependent output through `useHydrated()`/`useNow()` (not
  expected to be needed here).
- Detail pages: `notFound()` only on `isNotFound(reason)`.
- Update `CLAUDE.md` (endpoint list, component list, the clean-lap and benchmark definitions) in
  the same PR as each stage.
- Backend tests stay green; add tests for every new endpoint and the shared helper.

## Left to the builder

- Grid size, bandwidth tuning within Silverman, dot jitter algorithm, dot size.
- Exact tab vs section placement on the race page.
- Whether the season page fetches both toggle payloads server-side or one at a time.
- Dots on the compare and profile charts (none, or one per race).
- Mobile overflow behaviour.
- Copy for empty states and coverage notes.
