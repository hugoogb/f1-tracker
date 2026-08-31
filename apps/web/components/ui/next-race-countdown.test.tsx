import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextRaceCountdown } from './next-race-countdown'
import type { Race } from '@/lib/types'

const circuit = {
  id: 'albert_park',
  ref: 'albert_park',
  name: 'Albert Park Grand Prix Circuit',
  location: 'Melbourne',
  country: 'Australia',
  countryCode: 'AU',
} as Race['circuit']

function makeRace(overrides: Partial<Race> = {}): Race {
  return {
    id: '2026_01',
    seasonYear: 2026,
    round: 1,
    name: 'Australian Grand Prix',
    circuit,
    date: '2026-03-08',
    startTime: '2026-03-08T05:00:00Z',
    ...overrides,
  }
}

describe('NextRaceCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-03-01T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('counts down to the published start instant, not to midnight', () => {
    render(<NextRaceCountdown race={makeRace()} seasonYear={2026} />)

    // 2026-03-01T00:00Z -> 2026-03-08T05:00Z is 7 days and 5 hours.
    expect(screen.getByText('07')).toBeInTheDocument()
    expect(screen.getByText('05')).toBeInTheDocument()
  })

  it('shows the start time in the viewer local timezone', () => {
    render(<NextRaceCountdown race={makeRace()} seasonYear={2026} />)
    expect(screen.getByText(/lights out/i)).toBeInTheDocument()
  })

  it('omits the local start label when the start time is unknown', () => {
    render(<NextRaceCountdown race={makeRace({ startTime: null })} seasonYear={2026} />)
    expect(screen.queryByText(/lights out/i)).not.toBeInTheDocument()
  })

  it('still counts down to race day when the start time is unknown', () => {
    render(<NextRaceCountdown race={makeRace({ startTime: null })} seasonYear={2026} />)
    // Midnight UTC on 8 March is exactly 7 days out.
    expect(screen.getByText('07')).toBeInTheDocument()
  })

  it('renders nothing once the race has started', () => {
    vi.setSystemTime(new Date('2026-03-08T06:00:00Z'))
    const { container } = render(<NextRaceCountdown race={makeRace()} seasonYear={2026} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('links to the race detail page', () => {
    render(<NextRaceCountdown race={makeRace()} seasonYear={2026} />)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/seasons/2026/races/1')
  })
})
