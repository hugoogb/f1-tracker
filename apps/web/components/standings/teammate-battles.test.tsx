import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TeammateBattles } from './teammate-battles'
import type { TeammateTeam } from '@/lib/types'

// Takes pairings explicitly rather than a Partial<TeammateTeam>: TypeScript
// resolves a property named `constructor` against Object.prototype in a
// partial, which does not typecheck.
function team(pairings?: TeammateTeam['pairings']): TeammateTeam {
  return {
    constructor: {
      ref: 'red_bull',
      name: 'Red Bull',
      color: '#4781D7',
    } as TeammateTeam['constructor'],
    pairings: pairings ?? [
      {
        sharedRaces: 24,
        race: { a: 19, b: 0, compared: 19 },
        qualifying: { a: 23, b: 1, compared: 24 },
        a: {
          driver: { ref: 'max_verstappen', lastName: 'Verstappen' } as never,
          points: 399,
          bestFinish: 1,
        },
        b: { driver: { ref: 'perez', lastName: 'Pérez' } as never, points: 138, bestFinish: 2 },
      },
    ],
  }
}

describe('TeammateBattles', () => {
  it('names the team and both drivers', () => {
    render(<TeammateBattles teams={[team()]} />)
    expect(screen.getByText('Red Bull')).toBeInTheDocument()
    expect(screen.getByText('Verstappen')).toBeInTheDocument()
    expect(screen.getByText('Pérez')).toBeInTheDocument()
  })

  it('shows the race and qualifying tallies', () => {
    render(<TeammateBattles teams={[team()]} />)
    expect(screen.getByText('19')).toBeInTheDocument()
    expect(screen.getByText('23')).toBeInTheDocument()
    expect(screen.getByText(/Race · 19 compared/)).toBeInTheDocument()
    expect(screen.getByText(/Qualifying · 24 compared/)).toBeInTheDocument()
  })

  it('describes each battle bar for screen readers', () => {
    render(<TeammateBattles teams={[team()]} />)
    expect(screen.getByLabelText('Race: 19 to 0 over 19 rounds')).toBeInTheDocument()
  })

  it('shows how many races the pair shared', () => {
    render(<TeammateBattles teams={[team()]} />)
    expect(screen.getByText('24 races together')).toBeInTheDocument()
  })

  it('shows each driver points for that team', () => {
    render(<TeammateBattles teams={[team()]} />)
    expect(screen.getByText('399 pts')).toBeInTheDocument()
    expect(screen.getByText('138 pts')).toBeInTheDocument()
  })

  it('explains that retirements are excluded', () => {
    render(<TeammateBattles teams={[team()]} />)
    expect(screen.getByText(/either driver retired are left out/i)).toBeInTheDocument()
  })

  it('hides one-off stand-in pairings', () => {
    const standIn = team([
      {
        ...team().pairings[0],
        sharedRaces: 1,
        a: { driver: { ref: 'bearman', lastName: 'Bearman' } as never, points: 6, bestFinish: 7 },
      },
    ])
    render(<TeammateBattles teams={[standIn]} />)
    expect(screen.queryByText('Bearman')).not.toBeInTheDocument()
    expect(screen.getByText(/no teammate pairings/i)).toBeInTheDocument()
  })

  it('reports when a season has no pairings at all', () => {
    render(<TeammateBattles teams={[]} />)
    expect(screen.getByText(/no teammate pairings/i)).toBeInTheDocument()
  })
})
