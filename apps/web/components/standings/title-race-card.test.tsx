import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TitleRaceCard } from './title-race-card'
import type { DriverTitleContender, TitleRaceResponse } from '@/lib/types'

function driverContender(
  lastName: string,
  points: number,
  overrides: Partial<Omit<DriverTitleContender, 'driver' | 'constructor'>> = {},
): DriverTitleContender {
  return {
    driver: {
      ref: lastName.toLowerCase(),
      firstName: 'A',
      lastName,
      code: null,
    } as DriverTitleContender['driver'],
    constructor: null,
    position: 1,
    points,
    maxAttainable: points + 200,
    gapToLeader: 0,
    canWin: true,
    isLeader: false,
    pointsNeeded: 0,
    ...overrides,
  }
}

function response(overrides: Partial<TitleRaceResponse> = {}): TitleRaceResponse {
  return {
    year: 2026,
    totalRounds: 22,
    roundsCompleted: 7,
    roundsRemaining: 15,
    pointsForWin: 25,
    sprintPointsForWin: 8,
    fastestLapBonus: 0,
    maxPointsPerRound: 33,
    maxPointsRemaining: 495,
    drivers: {
      decided: false,
      contenders: [
        driverContender('Antonelli', 156, { isLeader: true }),
        driverContender('Hamilton', 115, { position: 2, gapToLeader: 41 }),
        driverContender('Bottas', 0, {
          position: 22,
          gapToLeader: 156,
          canWin: false,
          pointsNeeded: 20,
        }),
      ],
    },
    constructors: { decided: false, contenders: [] },
    ...overrides,
  }
}

describe('TitleRaceCard', () => {
  it('summarises what is still on the table', () => {
    render(<TitleRaceCard data={response()} />)
    expect(screen.getByText(/15 of 22 rounds remaining/)).toBeInTheDocument()
    expect(screen.getByText('495')).toBeInTheDocument()
  })

  it('counts who is still in contention and who is out', () => {
    render(<TitleRaceCard data={response()} />)
    // The count is split across elements, so match on the sentence.
    expect(
      screen.getByText(
        (_, el) => el?.textContent === '2 can still win it, 1 mathematically eliminated.',
      ),
    ).toBeInTheDocument()
  })

  it('lists only contenders who can still win', () => {
    render(<TitleRaceCard data={response()} />)
    expect(screen.getByText('A Antonelli')).toBeInTheDocument()
    expect(screen.getByText('A Hamilton')).toBeInTheDocument()
    expect(screen.queryByText('A Bottas')).not.toBeInTheDocument()
  })

  it('marks the leader', () => {
    render(<TitleRaceCard data={response()} />)
    expect(screen.getByText('Leader')).toBeInTheDocument()
  })

  it('shows each chaser gap to the leader', () => {
    render(<TitleRaceCard data={response()} />)
    expect(screen.getByText('−41')).toBeInTheDocument()
  })

  it('states the assumption behind the elimination maths', () => {
    render(<TitleRaceCard data={response()} />)
    expect(screen.getByText(/assumed to score nothing/)).toBeInTheDocument()
    expect(screen.getByText(/33 points/)).toBeInTheDocument()
  })

  it('switches to the constructors championship', async () => {
    const user = userEvent.setup()
    const data = response({
      constructors: {
        decided: false,
        contenders: [
          {
            constructor: {
              ref: 'mercedes',
              name: 'Mercedes',
              color: '#00D7B6',
            } as never,
            position: 1,
            points: 300,
            maxAttainable: 795,
            gapToLeader: 0,
            canWin: true,
            isLeader: true,
            pointsNeeded: 0,
          },
        ],
      },
    })
    render(<TitleRaceCard data={data} />)

    await user.click(screen.getByRole('button', { name: 'Constructors' }))

    expect(await screen.findByText('Mercedes')).toBeInTheDocument()
  })

  it('collapses a long field and expands on request', async () => {
    const user = userEvent.setup()
    const many = Array.from({ length: 22 }, (_, i) =>
      driverContender(`Driver${i}`, 200 - i, { position: i + 1, isLeader: i === 0 }),
    )
    render(<TitleRaceCard data={response({ drivers: { decided: false, contenders: many } })} />)

    expect(screen.queryByText('A Driver15')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /show 12 more/i }))

    expect(screen.getByText('A Driver15')).toBeInTheDocument()
  })

  it('reports a settled championship', () => {
    const data = response({
      drivers: { decided: true, contenders: [driverContender('Norris', 423, { isLeader: true })] },
    })
    render(<TitleRaceCard data={data} />)

    expect(screen.getByText(/mathematically settled/)).toBeInTheDocument()
  })
})
