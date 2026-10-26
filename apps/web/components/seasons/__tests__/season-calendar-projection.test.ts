import { describe, expect, it } from 'vitest'
import { greatCirclePath } from '@/lib/geo'
import {
  WORLD_PX,
  compactLongitudes,
  fitZoom,
  followZoom,
  headingAt,
  mercator,
  nearestCopy,
  pointAt,
  prefixAt,
  projectPath,
  unmercator,
} from '@/components/seasons/season-calendar-projection'

describe('mercator', () => {
  it('matches Leaflet at zoom 0 and round-trips', () => {
    expect(mercator([0, 0])).toEqual([128, 128])
    expect(mercator([0, 180])[0]).toBe(256)
    const [lat, lng] = unmercator(mercator([51.5, -0.12]))
    expect(lat).toBeCloseTo(51.5, 9)
    expect(lng).toBeCloseTo(-0.12, 9)
  })

  it('does not wrap longitude, so an unwrapped leg stays continuous', () => {
    expect(mercator([0, 200])[0]).toBeCloseTo(WORLD_PX * (0.5 + 200 / 360), 9)
  })
})

describe('projected paths', () => {
  // Melbourne -> Shanghai
  const path = projectPath(greatCirclePath([-37.85, 144.97], [31.34, 121.22]))

  it('pointAt runs from start to end', () => {
    expect(pointAt(path, 0)).toEqual(path.points[0])
    expect(pointAt(path, 1)).toEqual(path.points[path.points.length - 1])
  })

  it('prefixAt ends exactly where pointAt is', () => {
    for (const f of [0.13, 0.5, 0.87]) {
      const prefix = prefixAt(path, f)
      expect(prefix[prefix.length - 1]).toEqual(pointAt(path, f))
    }
  })

  it('moves at an even on-screen speed', () => {
    const step = (a: number, b: number) => {
      const [x0, y0] = pointAt(path, a)
      const [x1, y1] = pointAt(path, b)
      return Math.hypot(x1 - x0, y1 - y0)
    }
    expect(step(0, 0.1)).toBeCloseTo(step(0.5, 0.6), 1)
  })

  it('heads north-ish from Melbourne to Shanghai', () => {
    const heading = headingAt(path, 0.5)!
    expect(Math.abs(heading)).toBeLessThan(Math.PI / 4)
  })
})

describe('nearestCopy', () => {
  it('picks the copy of a longitude closest to the view', () => {
    expect(nearestCopy(-115, 170)).toBe(245)
    expect(nearestCopy(-115, 0)).toBe(-115)
    expect(nearestCopy(145, -170)).toBe(-215)
  })
})

describe('compactLongitudes', () => {
  it('keeps a Europe-centred calendar as it is', () => {
    // A 2025-like spread: the empty Pacific is the widest gap.
    const lngs = [145, 121, 136, 50, -1, -73, -46, -115, 51]
    expect(compactLongitudes(lngs)).toEqual(lngs)
  })

  it('frames a Pacific-centred set across the antimeridian', () => {
    // Japan, Australia, Las Vegas, Mexico City: the empty gap is the Atlantic.
    const out = compactLongitudes([136, 145, -115, -99])
    expect(out).toEqual([136, 145, 245, 261])
  })
})

describe('camera', () => {
  it('fitZoom fits a box with padding', () => {
    // 256 world px into 512 - 2*0 px: one zoom level.
    expect(fitZoom(256, 64, 512, 1000, 0)).toBeCloseTo(1, 9)
  })

  it('followZoom pulls back mid-leg and lands at the stop zoom', () => {
    expect(followZoom(0, 4, 2)).toBe(4)
    expect(followZoom(0.5, 4, 2)).toBeCloseTo(2, 9)
    expect(followZoom(1, 4, 2)).toBeCloseTo(4, 9)
    // A hop shorter than the arrival framing never zooms in.
    expect(followZoom(0.5, 4, 6)).toBe(4)
  })
})
