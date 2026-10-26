# Lap Time Distribution — Stage 1 (race chart) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A violin + swarm "Lap Time Distribution" chart on the race page, per driver or per constructor, built on a reusable violin component that Stages 2–3 will reuse.

**Architecture:** Frontend only. The race page already fetches `/laps` and trims it with `chartLaps()`; a pure module (`lib/violin.ts` for generic statistics, `lib/lap-distribution.ts` for the race-specific reduction) turns those laps into columns, and a hand-built SVG component (`components/charts/violin-chart.tsx`) draws them. A client wrapper (`components/races/lap-distribution-chart.tsx`) owns the Drivers/Constructors toggle, footers, legend and the "not shown" list.

**Tech Stack:** Next.js 16, React, TypeScript, Tailwind 4 tokens, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-26-lap-time-distribution-design.md` (Stage 1 + Definitions + Anti-goals).

## Global Constraints

- No driver photos or team logos: `DriverAvatar` / `ConstructorLogo` initials + `CountryFlag` only.
- Colours only from tokens / payload: tyre dots via `TYRE_COLORS` (`lib/constants.ts`, unknown → `TYRE_COLORS.UNKNOWN`); team colour via `teamColorOf()`; translucency via `color-mix(in oklab, <color> N%, transparent)`, never a hex alpha suffix; axis/grid styling from `lib/chart-theme.ts`; hover via `TooltipFrame`/`TooltipRow`.
- Clean lap: `lapNumber > 1`, `timeMs !== null`, `timeMs <= 1.07 × median(every timed lap after lap 1 of the race)`.
- A column needs ≥ 5 clean laps; anything below is listed as "Not shown".
- Deterministic output: no `Math.random`, no render-time clock.
- `chartLaps()` gains only `driver.firstName`, `driver.countryCode`, `constructor.ref`, `constructor.name`.
- Team mode shows no flag: `/laps` serialises constructors with `constructor_compact` (no `countryCode`), and Stage 1 has no backend change. *(Deviation from the spec's flag call, recorded here; Stage 2 can add `countryCode` to `constructor_compact` if wanted.)*
- Run frontend commands from the repo root (`pnpm test`, `pnpm lint`, `pnpm build`) — typecheck is `pnpm --filter web exec tsc --noEmit`.

## Review Focus

1. A race whose `/laps` has drivers but no timed laps after lap 1 → the chart shows an empty-state line, never NaN axes or a crash. (Task 2 test `returns no columns when nothing is timed`.)
2. A driver whose clean laps are all identical (or a single repeated value) → Silverman bandwidth is 0; the density must fall back to a positive bandwidth, not NaN. (Task 1 test `kde survives zero spread`.)
3. A constructor whose second driver retired on lap 3 → the team column is built from the pooled laps that exist, qualifying on the combined count. (Task 2 test `pools teammates even when one has too few laps`.)
4. Laps with a null compound → dots coloured `TYRE_COLORS.UNKNOWN`. (Task 2 test `colours unknown compounds`.)
5. A driver with a null `code` → label falls back to the first three letters of `lastName`, uppercased. (Task 2 test `labels fall back to last name`.)

---

### Task 1: Generic violin statistics (`lib/violin.ts`)

**Files:**
- Create: `apps/web/lib/violin.ts`
- Test: `apps/web/lib/__tests__/violin.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface DensityPoint { y: number; w: number }          // w in [0, 1]
  export interface ViolinDot { y: number; x: number; color: string; meta: Record<string, string> } // x in [-1, 1]
  export interface ViolinColumn {
    key: string; label: string; color: string
    median: number; q1: number; q3: number
    density: DensityPoint[]; dots?: ViolinDot[]
  }
  export function median(values: number[]): number                 // throws on empty
  export function quantile(sorted: number[], q: number): number    // linear interpolation (R type 7)
  export function silvermanBandwidth(values: number[]): number      // always > 0
  export function kde(values: number[], points?: number): DensityPoint[] // default 48 points
  export function densityAt(density: DensityPoint[], y: number): number  // linear interpolation, 0 outside
  export function jitter(seed: string): number                      // deterministic, in [-1, 1]
  export function niceTicks(min: number, max: number, maxTicks: number): number[]
  ```

- [ ] **Step 1: Write the failing tests** in `lib/__tests__/violin.test.ts`:
  - `median([3, 1, 2]) === 2`; `median([1, 2, 3, 4]) === 2.5`; `median([])` throws.
  - `quantile([1, 2, 3, 4], 0.25) === 1.75`; `quantile([1, 2, 3, 4], 0.75) === 3.25`.
  - `silvermanBandwidth([1, 2, 3, 4, 5])` ≈ `0.9 * Math.min(sd, iqr / 1.34) * 5 ** -0.2` with sample sd `Math.sqrt(2.5)` and iqr `2` (type-7 quartiles 2 and 4) — `toBeCloseTo(…, 6)`.
  - `kde survives zero spread`: `kde([100, 100, 100])` has 48 points, every `w` finite, `Math.max(...w) === 1`.
  - `kde([1, 2, 3, 4, 5])`: length 48, ascending `y`, first `y` < 1 and last `y` > 5 (grid is padded), max `w` is 1, and `w` is symmetric: `w[i]` ≈ `w[47 - i]` to 6 places.
  - `densityAt` returns 0 below the first and above the last grid point, the exact `w` on a grid point, and the midpoint value halfway between two grid points.
  - `jitter('ver-12') === jitter('ver-12')`, `jitter('ver-12') !== jitter('ver-13')`, and 1000 seeds all land in `[-1, 1]` with both signs present.
  - `niceTicks(98.2, 106.9, 8)` → `[99, 100, 101, 102, 103, 104, 105, 106]`; `niceTicks(0, 1, 6)` → `[0, 0.2, 0.4, 0.6, 0.8, 1]`.

- [ ] **Step 2: Run to confirm they fail**
  Run: `pnpm test -- lib/__tests__/violin.test.ts` — Expected: FAIL, module not found.

- [ ] **Step 3: Implement `lib/violin.ts`**
  - `silvermanBandwidth`: `h = 0.9 × min(sd, IQR / 1.34) × n^(-1/5)` (sample sd, type-7 IQR; if one of sd/IQR is 0 use the other). If `h <= 0` or not finite, fall back to `Math.max(Math.abs(median(values)) * 0.001, 1e-6)`.
  - `kde`: Gaussian kernel, grid evenly spaced over `[min − 2h, max + 2h]`, then divide every `w` by the maximum so the widest point is 1 (columns compare shape, not area).
  - `jitter`: hash the seed string (FNV-1a 32-bit) and map to `[-1, 1]`.
  - `niceTicks`: step is the smallest of `{1, 2, 2.5, 5} × 10^k` giving at most `maxTicks` ticks inside `[min, max]`; ticks are multiples of the step, rounded to avoid float noise (`Number(x.toFixed(10))`).
  - Module comment: these are the maths the Stage 2 Python helper must reproduce; change both or neither (same arrangement as `geo.py` / `geo.ts`).

- [ ] **Step 4: Run to confirm they pass**
  Run: `pnpm test -- lib/__tests__/violin.test.ts` — Expected: all PASS.

- [ ] **Step 5: Commit**
  `git add apps/web/lib/violin.ts apps/web/lib/__tests__/violin.test.ts && git commit -m "feat(charts): violin statistics helpers"`

---

### Task 2: Race lap distribution reducer (`lib/lap-distribution.ts`) + trimmed laps

**Files:**
- Create: `apps/web/lib/lap-distribution.ts`
- Test: `apps/web/lib/__tests__/lap-distribution.test.ts`
- Modify: `apps/web/lib/types.ts:263-267` (`ChartDriverLaps`)
- Modify: `apps/web/app/seasons/[year]/races/[round]/page.tsx:75-81` (`chartLaps()`)
- Modify: `pipeline/src/api/routers/races.py:523` and `pipeline/src/api/constants.py:20` — comment only, naming the TS twins

**Interfaces:**
- Consumes: Task 1 (`median`, `quantile`, `kde`, `jitter`, `ViolinColumn`, `ViolinDot`).
- Produces:
  ```ts
  // types.ts
  export interface ChartDriverLaps {
    driver: Pick<Driver, 'ref' | 'code' | 'firstName' | 'lastName' | 'countryCode'>
    constructor: Pick<Constructor, 'ref' | 'name' | 'color'>
    laps: Pick<LapData, 'lapNumber' | 'timeMs' | 'compound'>[]
  }
  // lap-distribution.ts
  export const CLEAN_LAP_THRESHOLD = 1.07   // twin of _CLEAN_LAP_THRESHOLD (routers/races.py)
  export const MIN_CLEAN_LAPS = 5           // twin of SEASON_COMPARE_MIN_CLEAN_LAPS (api/constants.py)
  export type DistributionMode = 'drivers' | 'constructors'
  export interface RaceColumn extends ViolinColumn {
    gapMs: number          // column median − fastest column median; 0 for the first
    cleanLaps: number
    entity:
      | { kind: 'driver'; firstName: string; lastName: string; countryCode: string | null }
      | { kind: 'constructor'; name: string }
  }
  export interface RaceDistribution {
    columns: RaceColumn[]                                    // fastest median first
    excluded: { key: string; label: string; cleanLaps: number }[]
    totalLaps: number                                        // timed laps after lap 1
    cleanLaps: number
    thresholdMs: number | null
  }
  export function raceDistribution(drivers: ChartDriverLaps[], mode: DistributionMode): RaceDistribution
  ```
  Column values (`median`, `q1`, `q3`, `density.y`, `dots.y`) are lap times in **milliseconds**. `key` is the driver or constructor ref. `color` is `teamColorOf(constructor.color)`. Dot `x` is `jitter(`${driverRef}-${lapNumber}`)`; dot `color` is `TYRE_COLORS[compound?.toUpperCase() ?? 'UNKNOWN'] ?? TYRE_COLORS.UNKNOWN`; dot `meta` is `{ driver: code-or-label, lap: String(lapNumber), compound: compound ?? 'Unknown' }`.

- [ ] **Step 1: Write the failing tests** with a small fixture builder (`driverLaps(ref, team, times[], compound?)`, lap numbers 1..n):
  - `drops lap 1 and slow laps`: one driver with times `[200_000, 90_000 ×6, 120_000]` plus a second driver with `[90_000 ×8]` → `thresholdMs` `toBeCloseTo(96_300, 6)`, first driver's `cleanLaps === 6`, `totalLaps === 14`.
  - `orders by median and computes gaps`: drivers at 91_000 and 90_000 → columns `[fast, slow]`, `gapMs` `[0, 1000]`.
  - `excludes drivers under the minimum`: a driver with 4 clean laps appears in `excluded` with `cleanLaps: 4`, not in `columns`.
  - `pools teammates even when one has too few laps`: constructors mode, team A with drivers of 6 and 2 clean laps → one column `key: 'team-a'`, `cleanLaps: 8`, 8 dots.
  - `returns no columns when nothing is timed`: all `timeMs` null → `columns: []`, `excluded: []`, `thresholdMs: null`, `totalLaps: 0`.
  - `colours unknown compounds`: a lap with `compound: null` → dot color `TYRE_COLORS.UNKNOWN`; `'soft'` lower-case → `TYRE_COLORS.SOFT`.
  - `labels fall back to last name`: `code: null, lastName: 'Hülkenberg'` → `label === 'HÜL'`; constructors mode label is the constructor `name`.
  - `is deterministic`: two calls on the same input are `toEqual`.

- [ ] **Step 2: Run to confirm they fail**
  Run: `pnpm test -- lib/__tests__/lap-distribution.test.ts` — Expected: FAIL, module not found.

- [ ] **Step 3: Implement** `lib/lap-distribution.ts`, extend `ChartDriverLaps`, and add the four fields in `chartLaps()` (update its doc comment: the distribution chart reads names and flags). In `routers/races.py` beside `_CLEAN_LAP_THRESHOLD`, and in `api/constants.py` beside `SEASON_COMPARE_MIN_CLEAN_LAPS`, add a one-line comment: "Mirrored in apps/web/lib/lap-distribution.ts; change both or neither."

- [ ] **Step 4: Run tests and typecheck**
  Run: `pnpm test && pnpm --filter web exec tsc --noEmit` — Expected: all PASS, no type errors (existing charts still accept the wider `ChartDriverLaps`).

- [ ] **Step 5: Commit**
  `git add -A apps/web/lib apps/web/app/seasons pipeline/src/api && git commit -m "feat(races): reduce race laps to lap-distribution columns"`

---

### Task 3: `ViolinChart` SVG component

**Files:**
- Create: `apps/web/components/charts/violin-chart.tsx`

**Interfaces:**
- Consumes: Task 1 (`ViolinColumn`, `ViolinDot`, `densityAt`, `niceTicks`); `axisProps`/`gridProps`/`REFERENCE`/`NEUTRAL` from `lib/chart-theme.ts`; `TooltipFrame`/`TooltipRow`.
- Produces:
  ```ts
  'use client'
  export interface ViolinChartProps<C extends ViolinColumn = ViolinColumn> {
    columns: C[]
    formatValue: (value: number) => string            // y-axis ticks and default tooltip
    renderFooter?: (column: C) => ReactNode           // under each column
    renderTooltip?: (hit: { column: C; dot?: ViolinDot }) => ReactNode
    connectMedians?: boolean                          // default true: dashed line through medians
    height?: number                                   // plot height px, default 420
    minColumnWidth?: number                           // px, default 44; container scrolls horizontally below it
    ariaLabel: string
  }
  export function ViolinChart<C extends ViolinColumn>(props: ViolinChartProps<C>): JSX.Element
  ```
  Stage 2 will add a `split` prop for half-violins; do not add it now.

- [ ] **Step 1: Implement the component**
  - Shared y scale over every column's density range; ticks from `niceTicks(min, max, 8)` with dashed grid lines (`gridProps`) and tick labels via `formatValue`. Faster (smaller) values at the bottom, as in the reference.
  - Per column: a closed path mirrored about the column centre with half-width `w × 0.45 × columnWidth`; fill `color-mix(in oklab, <color> 18%, transparent)`, stroke the column colour at 1px.
  - Dots: radius 2.5, `cx = centre + dot.x × densityAt(density, dot.y) × 0.4 × columnWidth`, filled `dot.color`.
  - Median: a diamond (rotated square, 10px) in `var(--foreground)`; when `connectMedians`, a dashed polyline (`REFERENCE`) through the column medians in order.
  - Layout: an `overflow-x-auto` wrapper; inner width `max(container, columns.length × minColumnWidth)` measured with a `ResizeObserver`; y-axis labels in a fixed left gutter.
  - Hover: pointer over a dot → `renderTooltip({ column, dot })`; over the column body → `renderTooltip({ column })`. Default tooltip shows median and IQR via `formatValue`. Position the `TooltipFrame` absolutely near the pointer.
  - `role="img"` + `aria-label={ariaLabel}` on the SVG.
  - No literal colours anywhere in the file.

- [ ] **Step 2: Lint and typecheck**
  Run: `pnpm lint && pnpm --filter web exec tsc --noEmit` — Expected: clean.

- [ ] **Step 3: Commit**
  `git add apps/web/components/charts/violin-chart.tsx && git commit -m "feat(charts): reusable SVG violin chart"`

---

### Task 4: Race-page `LapDistributionChart`, wiring, docs

**Files:**
- Create: `apps/web/components/races/lap-distribution-chart.tsx`
- Modify: `apps/web/app/seasons/[year]/races/[round]/page.tsx` (the `lap-times` tab content, ~line 395)
- Modify: `CLAUDE.md` (Frontend Components: charts + races lists; Conventions: the clean-lap twins)

**Interfaces:**
- Consumes: Task 2 (`raceDistribution`, `RaceColumn`, `DistributionMode`, `ChartDriverLaps`), Task 3 (`ViolinChart`).
- Produces: `export function LapDistributionChart({ drivers }: { drivers: ChartDriverLaps[] }): JSX.Element` (`'use client'`).

- [ ] **Step 1: Implement `LapDistributionChart`**
  - Toggle Drivers / Constructors (existing `Tabs` or two `Button`s, client state, default `drivers`); `useMemo(() => raceDistribution(drivers, mode), …)`.
  - `formatValue`: lap time as `m:ss.s` (e.g. `1:40.0`).
  - Footer per column: driver mode → `DriverAvatar` (size `sm`, `teamColor`) + `CountryFlag` (size 10) + label in `label` typography + gap; constructor mode → `ConstructorLogo` + label + gap. Gap reads `0.000` for the first column and `+0.247` (seconds, 3 decimals, `font-data`) otherwise.
  - Tooltip: dot → driver, `Lap 23`, lap time `1:40.512`, compound; column → median, IQR, `cleanLaps` clean laps.
  - Under the chart: a legend (median diamond, outline, dashed connector, one swatch per compound present) and a coverage line `"{cleanLaps} of {totalLaps} laps shown — lap 1 and laps slower than 107% of the race median are left out."`; when `excluded` is non-empty, `"Not shown (fewer than 5 clean laps): STR (3), …"`.
  - Empty `columns` → `"Not enough clean laps to draw a distribution for this race."`
  - `ariaLabel`: `"Lap time distribution by driver"` / `"… by constructor"`.

- [ ] **Step 2: Wire it into the race page**
  In the `lap-times` tab, when `laps` is set render `<div className="space-y-10">` with a `Lap Time Distribution` heading (same `h3` style as the strategy tab) + `<LapDistributionChart drivers={laps} />`, then the existing `LapTimesChart` under its own `Lap Times` heading.

- [ ] **Step 3: Update `CLAUDE.md`**
  - `components/charts/`: add "violin (lap distribution; shared by the race chart and the Stage 2–3 season/profile charts)".
  - `components/races/`: add `lap-distribution-chart`.
  - Conventions, next to the tyre-degradation bullet: the race chart's clean-lap filter runs in the browser (`lib/lap-distribution.ts`), mirroring `_CLEAN_LAP_THRESHOLD` and `SEASON_COMPARE_MIN_CLEAN_LAPS`; and `lib/violin.ts`'s KDE is the reference the Stage 2 Python helper must match — change both or neither.

- [ ] **Step 4: Verify**
  Run: `pnpm test && pnpm lint && pnpm --filter web exec tsc --noEmit && NODE_ENV=production pnpm build` — Expected: all clean.
  Then in the browser (local DB + `uv run uvicorn src.api.main:app` + `pnpm dev`), open a 2024 race (e.g. `/seasons/2024/races/19`), tab **Lap Times**: columns ordered fastest first, first gap `0.000`, dots tyre-coloured, toggle to Constructors pools teammates, narrow the viewport to 390px and the chart scrolls horizontally. Also open a pre-2018 race and confirm the tab is absent as before. If the local API/DB is unavailable, say so in the hand-off rather than claiming the browser check.

- [ ] **Step 5: Commit**
  `git add -A apps/web CLAUDE.md && git commit -m "feat(races): lap time distribution chart on the race page"`
