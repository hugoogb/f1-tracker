import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { StintPaceTable } from './stint-pace-table'
import type { DriverStints } from '@/lib/types'

const driver = {
  ref: 'max_verstappen',
  firstName: 'Max',
  lastName: 'Verstappen',
  code: 'VER',
} as DriverStints['driver']

const constructor = {
  ref: 'red_bull',
  name: 'Red Bull',
  color: '#3671C6',
} as DriverStints['constructor']

function entry(overrides: Partial<DriverStints> = {}): DriverStints {
  return {
    driver,
    constructor,
    position: 1,
    stints: [
      {
        stint: 1,
        compound: 'SOFT',
        startLap: 1,
        endLap: 17,
        laps: 17,
        medianMs: 97_030,
        bestMs: 96_296,
        degradationMsPerLap: 61.7,
      },
      {
        stint: 2,
        compound: 'HARD',
        startLap: 18,
        endLap: 57,
        laps: 40,
        medianMs: 95_529,
        bestMs: 95_160,
        degradationMsPerLap: null,
      },
    ],
    ...overrides,
  }
}

describe('StintPaceTable', () => {
  it('renders a row per stint', () => {
    render(<StintPaceTable drivers={[entry()]} />)
    expect(screen.getAllByRole('row')).toHaveLength(3) // header + two stints
  })

  it('shows the lap range and lap count', () => {
    render(<StintPaceTable drivers={[entry()]} />)
    expect(screen.getByText('1–17')).toBeInTheDocument()
    expect(screen.getByText('18–57')).toBeInTheDocument()
  })

  it('formats lap times as minutes and seconds', () => {
    render(<StintPaceTable drivers={[entry()]} />)
    expect(screen.getByText('1:37.030')).toBeInTheDocument()
    expect(screen.getByText('1:36.296')).toBeInTheDocument()
  })

  it('formats a sub-minute time as bare seconds', () => {
    const quick = entry({
      stints: [{ ...entry().stints[0], medianMs: 59_999, bestMs: 58_500 }],
    })
    render(<StintPaceTable drivers={[quick]} />)
    expect(screen.getByText('59.999')).toBeInTheDocument()
  })

  it('signs degradation and renders a dash when it was withheld', () => {
    render(<StintPaceTable drivers={[entry()]} />)
    expect(screen.getByText('+0.062')).toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('names the driver once, on their first stint row', () => {
    render(<StintPaceTable drivers={[entry()]} />)
    expect(screen.getAllByRole('link', { name: 'Max Verstappen' })).toHaveLength(1)
  })

  it('labels each stint with its compound', () => {
    render(<StintPaceTable drivers={[entry()]} />)
    const rows = screen.getAllByRole('row')
    expect(within(rows[1]).getByText('SOFT')).toBeInTheDocument()
    expect(within(rows[2]).getByText('HARD')).toBeInTheDocument()
  })

  it('reports when there is no stint data', () => {
    render(<StintPaceTable drivers={[]} />)
    expect(screen.getByText(/no stint data available/i)).toBeInTheDocument()
  })

  it('explains how the pace figures were derived', () => {
    render(<StintPaceTable drivers={[entry()]} />)
    expect(screen.getByText(/green-flag laps only/i)).toBeInTheDocument()
    expect(screen.getByText(/fuel-corrected/i)).toBeInTheDocument()
  })
})
