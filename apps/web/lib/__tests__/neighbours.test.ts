import { describe, expect, it } from 'vitest'
import { roundNeighbours, seasonNeighbours } from '@/lib/neighbours'

describe('seasonNeighbours', () => {
  it('has no season before the first world championship', () => {
    expect(seasonNeighbours(1950, 2026)).toEqual({ prev: null, next: 1951 })
  })

  it('has no season after the current year', () => {
    expect(seasonNeighbours(2026, 2026)).toEqual({ prev: 2025, next: null })
  })

  it('links both ways in between', () => {
    expect(seasonNeighbours(1990, 2026)).toEqual({ prev: 1989, next: 1991 })
  })
})

describe('roundNeighbours', () => {
  it('has no round before the first or after the last', () => {
    expect(roundNeighbours(1, 23)).toEqual({ prev: null, next: 2 })
    expect(roundNeighbours(23, 23)).toEqual({ prev: 22, next: null })
  })

  it('links both ways mid-season', () => {
    expect(roundNeighbours(12, 23)).toEqual({ prev: 11, next: 13 })
  })

  it('links nowhere when the calendar is unknown', () => {
    expect(roundNeighbours(1, 0)).toEqual({ prev: null, next: null })
  })
})
