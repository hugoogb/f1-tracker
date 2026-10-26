import { TYRE_COLORS } from '@/lib/constants'
import type { ChartDriverLaps } from '@/lib/types'
import { teamColorOf } from '@/lib/utils'
import { jitter, kde, median, quantile, type ViolinColumn, type ViolinDot } from '@/lib/violin'

/**
 * A lap slower than this multiple of the race's median is a pit stop, a safety
 * car or traffic, not pace. Mirrors `_CLEAN_LAP_THRESHOLD` in
 * `pipeline/src/api/routers/races.py`; change both or neither.
 */
export const CLEAN_LAP_THRESHOLD = 1.07

/**
 * Below this many clean laps a median is one or two laps, not a pace. Mirrors
 * `SEASON_COMPARE_MIN_CLEAN_LAPS` in `pipeline/src/api/constants.py`.
 */
export const MIN_CLEAN_LAPS = 5

export type DistributionMode = 'drivers' | 'constructors'

export interface RaceColumn extends ViolinColumn {
  /** Column median minus the fastest column's median; 0 for the first. */
  gapMs: number
  cleanLaps: number
  entity:
    | { kind: 'driver'; firstName: string; lastName: string; countryCode: string | null }
    | { kind: 'constructor'; name: string }
}

export interface RaceDistribution {
  /** Fastest median first. */
  columns: RaceColumn[]
  /** Entities with fewer than `MIN_CLEAN_LAPS` clean laps, so a DNF never just vanishes. */
  excluded: { key: string; label: string; cleanLaps: number }[]
  /** Timed laps after lap 1. */
  totalLaps: number
  cleanLaps: number
  thresholdMs: number | null
}

interface Group {
  key: string
  label: string
  color: string
  entity: RaceColumn['entity']
  dots: ViolinDot[]
}

function driverLabel(driver: ChartDriverLaps['driver']): string {
  return driver.code ?? driver.lastName.slice(0, 3).toUpperCase()
}

/**
 * A race's laps reduced to one violin per driver or per constructor: lap 1
 * and anything slower than 107% of the race median dropped, teammates pooled
 * in constructor mode, ordered fastest median first. Values are milliseconds.
 */
export function raceDistribution(
  drivers: ChartDriverLaps[],
  mode: DistributionMode,
): RaceDistribution {
  const timed = drivers.flatMap((d) =>
    d.laps
      .filter((lap) => lap.lapNumber > 1 && lap.timeMs !== null)
      .map((lap) => ({ driver: d, lap, timeMs: lap.timeMs as number })),
  )
  if (timed.length === 0) {
    return { columns: [], excluded: [], totalLaps: 0, cleanLaps: 0, thresholdMs: null }
  }

  const thresholdMs = median(timed.map((t) => t.timeMs)) * CLEAN_LAP_THRESHOLD
  const groups = new Map<string, Group>()
  // Every driver gets a group, even with no clean laps, so the "not shown"
  // list can name them.
  for (const d of drivers) {
    const key = mode === 'drivers' ? d.driver.ref : d.constructor.ref
    if (groups.has(key)) continue
    groups.set(key, {
      key,
      label: mode === 'drivers' ? driverLabel(d.driver) : d.constructor.name,
      color: teamColorOf(d.constructor.color) as string,
      entity:
        mode === 'drivers'
          ? {
              kind: 'driver',
              firstName: d.driver.firstName,
              lastName: d.driver.lastName,
              countryCode: d.driver.countryCode,
            }
          : { kind: 'constructor', name: d.constructor.name },
      dots: [],
    })
  }

  let cleanLaps = 0
  for (const { driver, lap, timeMs } of timed) {
    if (timeMs > thresholdMs) continue
    cleanLaps++
    const compound = lap.compound?.toUpperCase() ?? 'UNKNOWN'
    const key = mode === 'drivers' ? driver.driver.ref : driver.constructor.ref
    groups.get(key)!.dots.push({
      y: timeMs,
      x: jitter(`${driver.driver.ref}-${lap.lapNumber}`),
      color: TYRE_COLORS[compound] ?? TYRE_COLORS.UNKNOWN,
      meta: {
        driver: driverLabel(driver.driver),
        lap: String(lap.lapNumber),
        compound: lap.compound ?? 'Unknown',
      },
    })
  }

  const columns: RaceColumn[] = []
  const excluded: RaceDistribution['excluded'] = []
  for (const group of groups.values()) {
    if (group.dots.length < MIN_CLEAN_LAPS) {
      excluded.push({ key: group.key, label: group.label, cleanLaps: group.dots.length })
      continue
    }
    const values = group.dots.map((dot) => dot.y).sort((a, b) => a - b)
    columns.push({
      key: group.key,
      label: group.label,
      color: group.color,
      median: quantile(values, 0.5),
      q1: quantile(values, 0.25),
      q3: quantile(values, 0.75),
      density: kde(values),
      dots: group.dots,
      gapMs: 0,
      cleanLaps: values.length,
      entity: group.entity,
    })
  }

  // Ties break on the key so the order never depends on input order.
  columns.sort((a, b) => a.median - b.median || a.key.localeCompare(b.key))
  const fastest = columns[0]?.median ?? 0
  for (const column of columns) column.gapMs = column.median - fastest

  return { columns, excluded, totalLaps: timed.length, cleanLaps, thresholdMs }
}
