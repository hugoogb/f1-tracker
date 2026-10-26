import { describe, expect, it } from 'vitest'
import {
  densityAt,
  jitter,
  kde,
  median,
  niceTicks,
  quantile,
  silvermanBandwidth,
} from '@/lib/violin'

describe('median', () => {
  it('takes the middle value of an odd count', () => {
    expect(median([3, 1, 2])).toBe(2)
  })

  it('averages the middle pair of an even count', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5)
  })

  it('refuses an empty list', () => {
    expect(() => median([])).toThrow()
  })
})

describe('quantile', () => {
  it('interpolates linearly between ranks', () => {
    expect(quantile([1, 2, 3, 4], 0.25)).toBe(1.75)
    expect(quantile([1, 2, 3, 4], 0.75)).toBe(3.25)
  })
})

describe('silvermanBandwidth', () => {
  it('uses the smaller of the sd and the scaled IQR', () => {
    const sd = Math.sqrt(2.5)
    const iqr = 2
    expect(silvermanBandwidth([1, 2, 3, 4, 5])).toBeCloseTo(
      0.9 * Math.min(sd, iqr / 1.34) * 5 ** -0.2,
      6,
    )
  })
})

describe('kde', () => {
  it('kde survives zero spread', () => {
    const density = kde([100, 100, 100])
    expect(density).toHaveLength(48)
    expect(density.every((p) => Number.isFinite(p.w) && Number.isFinite(p.y))).toBe(true)
    expect(Math.max(...density.map((p) => p.w))).toBe(1)
  })

  it('pads the grid past the data and normalises the widest point to 1', () => {
    const density = kde([1, 2, 3, 4, 5])
    expect(density).toHaveLength(48)
    for (let i = 1; i < density.length; i++) {
      expect(density[i].y).toBeGreaterThan(density[i - 1].y)
    }
    expect(density[0].y).toBeLessThan(1)
    expect(density[47].y).toBeGreaterThan(5)
    expect(Math.max(...density.map((p) => p.w))).toBe(1)
  })

  it('is symmetric for symmetric data', () => {
    const density = kde([1, 2, 3, 4, 5])
    for (let i = 0; i < 48; i++) {
      expect(density[i].w).toBeCloseTo(density[47 - i].w, 6)
    }
  })
})

describe('densityAt', () => {
  const density = [
    { y: 0, w: 0.2 },
    { y: 1, w: 1 },
    { y: 2, w: 0.4 },
  ]

  it('is zero outside the grid', () => {
    expect(densityAt(density, -0.5)).toBe(0)
    expect(densityAt(density, 2.5)).toBe(0)
  })

  it('returns the grid value on a grid point', () => {
    expect(densityAt(density, 1)).toBe(1)
  })

  it('interpolates between grid points', () => {
    expect(densityAt(density, 1.5)).toBeCloseTo(0.7, 10)
  })
})

describe('jitter', () => {
  it('is deterministic per seed', () => {
    expect(jitter('ver-12')).toBe(jitter('ver-12'))
    expect(jitter('ver-12')).not.toBe(jitter('ver-13'))
  })

  it('stays within [-1, 1] and uses both sides', () => {
    const values = Array.from({ length: 1000 }, (_, i) => jitter(`seed-${i}`))
    expect(values.every((v) => v >= -1 && v <= 1)).toBe(true)
    expect(values.some((v) => v < 0)).toBe(true)
    expect(values.some((v) => v > 0)).toBe(true)
  })
})

describe('niceTicks', () => {
  it('picks whole steps inside the range', () => {
    expect(niceTicks(98.2, 106.9, 8)).toEqual([99, 100, 101, 102, 103, 104, 105, 106])
  })

  it('handles fractional steps without float noise', () => {
    expect(niceTicks(0, 1, 6)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1])
  })
})
