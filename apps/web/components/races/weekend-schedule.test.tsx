import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WeekendSchedule } from './weekend-schedule'
import type { WeekendSession } from '@/lib/types'

const sessions: WeekendSession[] = [
  {
    kind: 'FP1',
    label: 'Practice 1',
    date: '2026-09-04',
    time: '09:30:00',
    startTime: '2026-09-04T09:30:00Z',
  },
  {
    kind: 'QUALIFYING',
    label: 'Qualifying',
    date: '2026-09-05',
    time: '12:00:00',
    startTime: '2026-09-05T12:00:00Z',
  },
  {
    kind: 'RACE',
    label: 'Race',
    date: '2026-09-06',
    time: '13:00:00',
    startTime: '2026-09-06T13:00:00Z',
  },
]

describe('WeekendSchedule', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-09-01T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('lists every session', () => {
    render(<WeekendSchedule sessions={sessions} />)
    expect(screen.getByText('Practice 1')).toBeInTheDocument()
    expect(screen.getByText('Qualifying')).toBeInTheDocument()
    expect(screen.getByText('Race')).toBeInTheDocument()
  })

  it('counts down to the next session only', () => {
    render(<WeekendSchedule sessions={sessions} />)
    // 1 Sept -> Practice 1 on 4 Sept.
    expect(screen.getByText(/in 3d/)).toBeInTheDocument()
    expect(screen.getAllByText(/^in /)).toHaveLength(1)
  })

  it('moves the countdown on once a session has run', () => {
    vi.setSystemTime(new Date('2026-09-04T12:00:00Z'))
    render(<WeekendSchedule sessions={sessions} />)
    // Practice is done, so qualifying on 5 Sept is next.
    expect(screen.getByText(/in 1d/)).toBeInTheDocument()
  })

  it('says times are shown locally', () => {
    render(<WeekendSchedule sessions={sessions} />)
    expect(screen.getByText(/your local timezone/i)).toBeInTheDocument()
  })

  it('falls back to the date when a session has no time yet', () => {
    render(
      <WeekendSchedule
        sessions={[
          { kind: 'FP1', label: 'Practice 1', date: '2026-09-04', time: null, startTime: null },
        ]}
      />,
    )
    expect(screen.getByText('2026-09-04')).toBeInTheDocument()
  })

  it('renders nothing without sessions', () => {
    const { container } = render(<WeekendSchedule sessions={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
