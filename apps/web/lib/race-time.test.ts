import { describe, expect, it } from 'vitest'
import { formatLocalStart, getTimeLeft, raceStartDate } from './race-time'

describe('raceStartDate', () => {
  it('uses the published UTC start instant when available', () => {
    const target = raceStartDate({ date: '2026-03-08', startTime: '2026-03-08T05:00:00Z' })
    expect(target?.toISOString()).toBe('2026-03-08T05:00:00.000Z')
  })

  it('falls back to midnight UTC when the start time is unknown', () => {
    const target = raceStartDate({ date: '1976-08-01', startTime: null })
    expect(target?.toISOString()).toBe('1976-08-01T00:00:00.000Z')
  })

  it('treats a missing startTime field the same as null', () => {
    const target = raceStartDate({ date: '1976-08-01' })
    expect(target?.toISOString()).toBe('1976-08-01T00:00:00.000Z')
  })

  it('returns null without a date', () => {
    expect(raceStartDate({ date: '', startTime: null })).toBeNull()
  })

  it('returns null for an unparseable date', () => {
    expect(raceStartDate({ date: 'not-a-date', startTime: null })).toBeNull()
  })
})

describe('getTimeLeft', () => {
  const now = new Date('2026-03-01T00:00:00Z')

  it('breaks the remaining time into days, hours, minutes and seconds', () => {
    const target = new Date('2026-03-08T05:30:45Z')
    expect(getTimeLeft(target, now)).toEqual({
      days: 7,
      hours: 5,
      minutes: 30,
      seconds: 45,
    })
  })

  it('returns null once the target has passed', () => {
    expect(getTimeLeft(new Date('2026-02-28T00:00:00Z'), now)).toBeNull()
  })

  it('returns null exactly at the start instant', () => {
    expect(getTimeLeft(now, now)).toBeNull()
  })

  it('counts sub-day gaps without borrowing a day', () => {
    const target = new Date('2026-03-01T02:15:00Z')
    expect(getTimeLeft(target, now)).toEqual({
      days: 0,
      hours: 2,
      minutes: 15,
      seconds: 0,
    })
  })
})

describe('formatLocalStart', () => {
  it('renders a start instant as a readable local string', () => {
    // Exact output is locale- and timezone-dependent; assert it produced
    // something non-empty rather than pinning the runner's locale.
    expect(formatLocalStart('2026-03-08T05:00:00Z')).toBeTruthy()
  })

  it('returns null for an unparseable instant', () => {
    expect(formatLocalStart('nonsense')).toBeNull()
  })
})
