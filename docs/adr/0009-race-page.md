# 0009 — Race page

The race page and its result, timing and pit-stop components.

### Tyre legend lists only the compounds drawn

Where: `apps/web/components/races/lap-distribution-chart.tsx` — `LapDistributionChart` (`compounds`)

The legend swatches are taken from the dots actually drawn, in `COMPOUND_ORDER`, rather than from a fixed palette, so a 2018 race's legend shows that year's compound colours and compounds with no dots are omitted.

### Gap labels round before choosing a format

Where: `apps/web/components/races/gap-chart.tsx` — `formatGap`

Seconds are rounded to a tenth before choosing between the seconds and minutes formats, so 119.96 s reads "+2:00.0" rather than "+1:60.0".

### Tabs are passed in, and scroll rather than wrap

Where: `apps/web/app/seasons/[year]/races/[round]/race-tabs.tsx` — `RaceTabs`

Which tabs a race has depends on its era (sprints from 2021, pit stops from 2012, timing from 2018), so callers pass the ones they have rather than filling fixed slots. The strip scrolls sideways instead of wrapping, which keeps every tab reachable on a phone.
