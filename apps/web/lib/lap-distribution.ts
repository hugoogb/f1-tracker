import { TYRE_COLORS } from '@/lib/constants'
import type { ChartDriverLaps } from '@/lib/types'
import { driverCode, teamColorOf } from '@/lib/utils'
import { jitter, kde, median, quantile, type ViolinColumn, type ViolinDot } from '@/lib/violin'

export const CLEAN_LAP_THRESHOLD = 1.07

export const MIN_CLEAN_LAPS = 5

export type DistributionMode = 'drivers' | 'constructors'

export interface RaceColumn extends ViolinColumn {
  gapMs: number
  cleanLaps: number
  entity:
    | { kind: 'driver'; firstName: string; lastName: string; countryCode: string | null }
    | { kind: 'constructor'; name: string }
}

export interface RaceDistribution {
  columns: RaceColumn[]
  excluded: { key: string; label: string; cleanLaps: number }[]
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

export function normaliseCompound(raw: string | null): string {
  const compound = raw?.trim().toUpperCase() ?? ''
  return compound in TYRE_COLORS && compound !== 'TEST_UNKNOWN' ? compound : 'UNKNOWN'
}

const LEGACY_COMPOUNDS = new Set(['HYPERSOFT', 'ULTRASOFT', 'SUPERSOFT'])

const LEGACY_COLORS: Record<string, string> = {
  SOFT: 'var(--tyre-medium)',
  MEDIUM: 'var(--tyre-hard)',
  HARD: 'var(--tyre-hard-2018)',
}

export function formatLapTime(ms: number, decimals: number): string {
  const scale = 10 ** decimals
  const units = Math.round((ms / 1000) * scale)
  const minutes = Math.floor(units / (60 * scale))
  const seconds = (units - minutes * 60 * scale) / scale
  return `${minutes}:${seconds.toFixed(decimals).padStart(decimals + 3, '0')}`
}

export function axisLapLabel(ms: number): string {
  return formatLapTime(ms, ms % 100 === 0 ? 1 : 2)
}

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
  const legacy = timed.some((t) => LEGACY_COMPOUNDS.has(normaliseCompound(t.lap.compound)))
  const groups = new Map<string, Group>()
  for (const d of drivers) {
    const key = mode === 'drivers' ? d.driver.ref : d.constructor.ref
    if (groups.has(key)) continue
    groups.set(key, {
      key,
      label: mode === 'drivers' ? driverCode(d.driver) : d.constructor.name,
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
    const compound = normaliseCompound(lap.compound)
    const key = mode === 'drivers' ? driver.driver.ref : driver.constructor.ref
    groups.get(key)!.dots.push({
      y: timeMs,
      x: jitter(`${driver.driver.ref}-${lap.lapNumber}`),
      color: (legacy && LEGACY_COLORS[compound]) || TYRE_COLORS[compound],
      meta: {
        driver: driverCode(driver.driver),
        lap: String(lap.lapNumber),
        compound: compound.charAt(0) + compound.slice(1).toLowerCase(),
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

  columns.sort((a, b) => a.median - b.median || a.key.localeCompare(b.key))
  const fastest = columns[0]?.median ?? 0
  for (const column of columns) column.gapMs = column.median - fastest

  return { columns, excluded, totalLaps: timed.length, cleanLaps, thresholdMs }
}
