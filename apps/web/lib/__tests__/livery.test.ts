import { describe, expect, it } from 'vitest'
import { latestTeamColor, liveryStyle } from '@/lib/livery'

describe('liveryStyle', () => {
  it('sets nothing without a colour, so the page keeps the red accent', () => {
    expect(liveryStyle(null)).toEqual({})
    expect(liveryStyle(undefined)).toEqual({})
    expect(liveryStyle('')).toEqual({})
  })

  it('points the accent at the team colour', () => {
    expect(liveryStyle('#00D7B6')).toEqual({
      '--livery': '#00D7B6',
      '--accent-livery': '#00D7B6',
    })
  })
})

describe('latestTeamColor', () => {
  it("uses the latest season's team, whatever order the seasons arrive in", () => {
    expect(
      latestTeamColor([
        { year: 2025, constructor: { color: '#111111' } },
        { year: 2026, constructor: { color: '#00D7B6' } },
      ]),
    ).toBe('#00D7B6')
  })

  it('does not fall back to an older team when the latest has no colour', () => {
    expect(
      latestTeamColor([
        { year: 1958, constructor: { color: '#111111' } },
        { year: 1959, constructor: { color: null } },
      ]),
    ).toBeNull()
    expect(
      latestTeamColor([
        { year: 1958, constructor: { color: '#111111' } },
        { year: 1959, constructor: null },
      ]),
    ).toBeNull()
  })

  it('is null with no seasons', () => {
    expect(latestTeamColor([])).toBeNull()
  })
})
