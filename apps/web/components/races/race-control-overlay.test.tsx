import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RaceControlLegend, safetyCarAreas } from './race-control-overlay'
import type { RaceControlPeriod } from '@/lib/types'

const periods: RaceControlPeriod[] = [
  { kind: 'VIRTUAL_SAFETY_CAR', startLap: 24, endLap: 26 },
  { kind: 'SAFETY_CAR', startLap: 38, endLap: 42 },
]

describe('safetyCarAreas', () => {
  it('returns one reference area per period', () => {
    const areas = safetyCarAreas(periods)
    expect(areas).toHaveLength(2)
  })

  it('spans each period from its start lap to its end lap', () => {
    const areas = safetyCarAreas(periods)!
    expect(areas[0]).toMatchObject({ props: { x1: 24, x2: 26 } })
    expect(areas[1]).toMatchObject({ props: { x1: 38, x2: 42 } })
  })

  it('renders nothing without periods', () => {
    expect(safetyCarAreas([])).toBeNull()
    expect(safetyCarAreas(undefined)).toBeNull()
  })
})

describe('RaceControlLegend', () => {
  it('names each kind of period present', () => {
    render(<RaceControlLegend periods={periods} />)
    expect(screen.getByText(/virtual safety car/i)).toBeInTheDocument()
    expect(screen.getByText(/^Safety car$/i)).toBeInTheDocument()
  })

  it('lists a repeated kind once, with a count', () => {
    render(
      <RaceControlLegend
        periods={[
          { kind: 'SAFETY_CAR', startLap: 5, endLap: 8 },
          { kind: 'SAFETY_CAR', startLap: 30, endLap: 33 },
        ]}
      />,
    )
    expect(screen.getByText(/×2/)).toBeInTheDocument()
  })

  it('renders nothing without periods', () => {
    const { container } = render(<RaceControlLegend periods={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
