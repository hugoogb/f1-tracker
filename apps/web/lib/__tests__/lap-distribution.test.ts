import { describe, expect, it } from 'vitest'
import { TYRE_COLORS } from '@/lib/constants'
import { axisLapLabel, formatLapTime, raceDistribution } from '@/lib/lap-distribution'
import type { ChartDriverLaps } from '@/lib/types'

/** One driver's race, laps numbered from 1. */
function driverLaps(
  ref: string,
  team: string,
  times: (number | null)[],
  compound: string | null = 'MEDIUM',
  overrides: Partial<ChartDriverLaps['driver']> = {},
): ChartDriverLaps {
  return {
    driver: {
      ref,
      code: ref.slice(0, 3).toUpperCase(),
      firstName: 'First',
      lastName: ref,
      countryCode: 'GB',
      ...overrides,
    },
    constructor: { ref: team, name: `Team ${team}`, color: '#123456' },
    laps: times.map((timeMs, i) => ({ lapNumber: i + 1, timeMs, compound })),
  }
}

const repeat = (value: number, count: number) => Array.from({ length: count }, () => value)

describe('raceDistribution', () => {
  it('drops lap 1 and slow laps', () => {
    const result = raceDistribution(
      [
        driverLaps('alpha', 'a', [200_000, ...repeat(90_000, 6), 120_000]),
        driverLaps('bravo', 'b', repeat(90_000, 8)),
      ],
      'drivers',
    )
    expect(result.thresholdMs).toBeCloseTo(96_300, 6)
    expect(result.totalLaps).toBe(14)
    expect(result.cleanLaps).toBe(13)
    expect(result.columns.find((c) => c.key === 'alpha')?.cleanLaps).toBe(6)
  })

  it('orders by median and computes gaps', () => {
    const result = raceDistribution(
      [driverLaps('slow', 'a', repeat(91_000, 8)), driverLaps('fast', 'b', repeat(90_000, 8))],
      'drivers',
    )
    expect(result.columns.map((c) => c.key)).toEqual(['fast', 'slow'])
    expect(result.columns.map((c) => c.gapMs)).toEqual([0, 1000])
  })

  it('excludes drivers under the minimum', () => {
    const result = raceDistribution(
      [driverLaps('full', 'a', repeat(90_000, 8)), driverLaps('short', 'b', repeat(90_000, 5))],
      'drivers',
    )
    expect(result.columns.map((c) => c.key)).toEqual(['full'])
    expect(result.excluded).toEqual([{ key: 'short', label: 'SHO', cleanLaps: 4 }])
  })

  it('pools teammates even when one has too few laps', () => {
    const result = raceDistribution(
      [
        driverLaps('one', 'team-a', repeat(90_000, 7)),
        driverLaps('two', 'team-a', repeat(90_500, 3)),
      ],
      'constructors',
    )
    expect(result.columns).toHaveLength(1)
    expect(result.columns[0].key).toBe('team-a')
    expect(result.columns[0].cleanLaps).toBe(8)
    expect(result.columns[0].dots).toHaveLength(8)
    expect(result.excluded).toEqual([])
  })

  it('returns no columns when nothing is timed', () => {
    const result = raceDistribution([driverLaps('alpha', 'a', repeat(null as never, 8))], 'drivers')
    expect(result).toEqual({
      columns: [],
      excluded: [],
      totalLaps: 0,
      cleanLaps: 0,
      thresholdMs: null,
    })
  })

  it('colours unknown compounds', () => {
    const unknown = raceDistribution([driverLaps('alpha', 'a', repeat(90_000, 8), null)], 'drivers')
    expect(unknown.columns[0].dots?.[0].color).toBe(TYRE_COLORS.UNKNOWN)
    const soft = raceDistribution([driverLaps('alpha', 'a', repeat(90_000, 8), 'soft')], 'drivers')
    expect(soft.columns[0].dots?.[0].color).toBe(TYRE_COLORS.SOFT)
  })

  it('normalises junk and 2018 compounds', () => {
    const laps = (compound: string) =>
      raceDistribution([driverLaps('alpha', 'a', repeat(90_000, 8), compound)], 'drivers')
        .columns[0].dots![0]
    expect(laps('nan')).toMatchObject({ color: TYRE_COLORS.UNKNOWN, meta: { compound: 'Unknown' } })
    expect(laps('None')).toMatchObject({
      color: TYRE_COLORS.UNKNOWN,
      meta: { compound: 'Unknown' },
    })
    expect(TYRE_COLORS.SUPERSOFT).toBeDefined()
    expect(laps('SUPERSOFT')).toMatchObject({
      color: TYRE_COLORS.SUPERSOFT,
      meta: { compound: 'Supersoft' },
    })
    expect(TYRE_COLORS.HYPERSOFT).toBeDefined()
    expect(laps('HYPERSOFT').color).toBe(TYRE_COLORS.HYPERSOFT)
    expect(TYRE_COLORS.ULTRASOFT).toBeDefined()
    expect(laps('ULTRASOFT').color).toBe(TYRE_COLORS.ULTRASOFT)
  })

  it('uses the 2018 colours for soft, medium and hard alongside 2018 compounds', () => {
    const result = raceDistribution(
      [
        driverLaps('alpha', 'a', repeat(90_000, 8), 'SUPERSOFT'),
        driverLaps('bravo', 'b', repeat(90_000, 8), 'SOFT'),
        driverLaps('charlie', 'c', repeat(90_000, 8), 'MEDIUM'),
        driverLaps('delta', 'd', repeat(90_000, 8), 'HARD'),
      ],
      'drivers',
    )
    const colour = (key: string) => result.columns.find((c) => c.key === key)!.dots![0].color
    expect(colour('alpha')).toBe(TYRE_COLORS.SUPERSOFT)
    expect(colour('bravo')).toBe('var(--tyre-medium)')
    expect(colour('charlie')).toBe('var(--tyre-hard)')
    expect(colour('delta')).toBe('var(--tyre-hard-2018)')
  })

  it('labels fall back to last name', () => {
    const drivers = [
      driverLaps('hulkenberg', 'sauber', repeat(90_000, 8), 'HARD', {
        code: null,
        lastName: 'Hülkenberg',
      }),
    ]
    expect(raceDistribution(drivers, 'drivers').columns[0].label).toBe('HÜL')
    expect(raceDistribution(drivers, 'constructors').columns[0].label).toBe('Team sauber')
  })

  it('is deterministic', () => {
    const drivers = [
      driverLaps('alpha', 'a', [95_000, 90_100, 90_400, 89_900, 90_700, 90_200, 91_000]),
      driverLaps('bravo', 'b', [96_000, 90_900, 91_400, 90_800, 91_100, 91_300, 90_600]),
    ]
    expect(raceDistribution(drivers, 'drivers')).toEqual(raceDistribution(drivers, 'drivers'))
  })
})

describe('formatLapTime', () => {
  it('formats minutes and seconds', () => {
    expect(formatLapTime(98_339, 3)).toBe('1:38.339')
  })

  it('carries a rounded 60 into the minutes', () => {
    expect(formatLapTime(119_960, 1)).toBe('2:00.0')
    expect(formatLapTime(119_999.75, 3)).toBe('2:00.000')
  })
})

describe('axisLapLabel', () => {
  it('shows tenths unless the tick sits between them', () => {
    expect(axisLapLabel(96_000)).toBe('1:36.0')
    expect(axisLapLabel(95_200)).toBe('1:35.2')
    expect(axisLapLabel(95_250)).toBe('1:35.25')
  })
})
