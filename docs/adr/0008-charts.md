# 0008 — Charts

Recharts and hand-built SVG charts, the chart theme and the violin maths.

### Violin chart: one memoised layer and one pointer handler

Where: `apps/web/components/charts/violin-chart.tsx` — `ViolinChart` (`plot`, `track`, `hitAt`)

The outlines and dots form one memoised SVG layer, and a single handler on the frame resolves the target from `data-col`/`data-dot`, so hovering redraws only the highlight and tooltip and a thousand dots carry no listeners. The y-axis sits in a fixed gutter while the columns scroll on a narrow screen, and smaller values plot lower, so faster laps are at the bottom.

### Violin width is measured before first paint

Where: `apps/web/components/charts/violin-chart.tsx` — `ViolinChart` (`useLayoutEffect`)

The container width is read in a layout effect, before the first paint, so columns never draw at their minimum width and then jump to fill the container.

### Touch tooltips stay open until an outside tap

Where: `apps/web/components/charts/violin-chart.tsx` — `track`, `onPointerLeave`; `apps/web/components/charts/violin-chart.tsx` — `ViolinChart` (`onPointerLeave`)

On touch, a tap over the labels row or axis leaves an open tooltip alone, and pointerleave is ignored because a finger lifting fires it straight after the tap that opened the tooltip. The tooltip closes on a tap outside the chart (the document `pointerdown` listener). On touch, pointerleave does not close the tooltip, because a finger lifting fires it straight after the tap that opened it; the tooltip stays until a tap lands outside the chart.

### Tyre compounds are normalised and 2018 gets its own colours

Where: `apps/web/lib/lap-distribution.ts` — `normaliseCompound`, `LEGACY_COMPOUNDS`, `LEGACY_COLORS`

Stored compounds include 2018's hyper/ultra/supersoft and pandas' missing-value strings (`nan`, `None`), which must read as unknown rather than as a compound called "nan". A race that used the 2018 names is drawn in that year's palette (soft yellow, medium white, hard ice blue) so its supersoft and soft are not both red. In 2018 the range ran down to hypersoft and the soft, medium and hard were yellow, white and ice blue, so a race using the 2018 names is recoloured as a whole.

### Lap times round before they split into minutes

Where: `apps/web/lib/lap-distribution.ts` — `formatLapTime`

The whole time is rounded to the requested decimals before it is split into minutes and seconds, so 119.96 s reads `2:00.0` and never `1:60.0`.

### Entities with too few clean laps are listed, not dropped

Where: `apps/web/lib/lap-distribution.ts` — `raceDistribution`

Every driver gets a group even with no clean laps, so those below `MIN_CLEAN_LAPS` end up in `excluded` and the chart can name them instead of a DNF silently vanishing.

### Column order is deterministic

Where: `apps/web/lib/lap-distribution.ts` — `raceDistribution`

Columns sort by median and break ties on the key, so the order never depends on the order of the input and a cached page renders the same bytes each time.

### Violin bandwidth is never zero

Where: `apps/web/lib/violin.ts` — `silvermanBandwidth`

The bandwidth falls back to a sliver of the median when the spread is zero, because a column whose values are all equal still needs a width to draw.

### Score colours are never the only identity

Where: `apps/web/lib/chart-theme.ts` — `SCORE_COLORS`

The best-seasons component colours are chosen as a set for separation between neighbours and contrast on the dark surface. Every segment is also gapped and named in a legend, so colour never carries the identity alone.
