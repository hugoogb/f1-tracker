import { describe, expect, it } from 'vitest'
import { filledSegments } from '@/lib/meter'

describe('filledSegments', () => {
  it('rounds the share to the nearest segment', () => {
    expect(filledSegments(8, 38, 10)).toBe(2)
    expect(filledSegments(15, 38, 10)).toBe(4)
  })

  it('clamps to the meter', () => {
    expect(filledSegments(50, 38, 10)).toBe(10)
    expect(filledSegments(-1, 38, 10)).toBe(0)
  })

  it('treats an empty or broken scale as empty', () => {
    expect(filledSegments(5, 0, 10)).toBe(0)
    expect(filledSegments(NaN, 10, 10)).toBe(0)
  })
})
