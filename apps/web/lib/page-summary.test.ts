import { describe, expect, it } from 'vitest'
import {
  constructorPairSummary,
  constructorSummary,
  circuitSummary,
  driverPairSummary,
  driverSummary,
  formatRecordValue,
  group,
  nationalitySummary,
  raceSummary,
  rankingSummary,
  seasonSummary,
} from './page-summary'
import type { DriverSeasonSummary, RecordsExploreResponse, SeasonCalendarResponse } from './types'

const team = (name: string) =>
  ({ id: name, ref: name, name, nationality: null, countryCode: null, color: null }) as const

const season = (year: number, name: string, pos: number | null): DriverSeasonSummary => ({
  year,
  constructor: team(name),
  races: 16,
  wins: 1,
  podiums: 1,
  points: 10,
  championshipPosition: pos,
})

describe('group', () => {
  it('uses one fixed format', () => {
    expect(group(63214.4)).toBe('63,214')
    expect(group(999)).toBe('999')
  })
})

describe('driverSummary', () => {
  const stats = { total_races: 162, wins: 41, podiums: 80, poles: 65, championships: 3 }
  const currentYear = 2026

  it('names the career, its teams in order, and the titles', () => {
    const text = driverSummary({
      name: 'Ayrton Senna',
      nationality: 'Brazilian',
      stats,
      seasons: [
        season(1990, 'McLaren', 1),
        season(1984, 'Toleman', 9),
        season(1988, 'McLaren', 1),
        season(1991, 'McLaren', 1),
      ],
      currentYear,
    })
    expect(text).toContain("Brazilian driver Ayrton Senna's Formula 1 career spans 4 seasons")
    expect(text).toContain('with Toleman and McLaren')
    expect(text).toContain('41 wins (25.3% of starts)')
    expect(text).toContain('World champion 3 times: 1988, 1990 and 1991.')
  })

  it('does not call a lead in a season still running a title, or a finish', () => {
    const text = driverSummary({
      name: 'A Driver',
      nationality: null,
      stats: { ...stats, championships: 0 },
      seasons: [season(2025, 'X', 4), season(2026, 'X', 1)],
      currentYear,
    })
    expect(text).not.toContain('World champion')
    expect(text).toContain('Best championship finish: P4 in 2025.')
  })

  it('counts a mid-season team change as one season', () => {
    const text = driverSummary({
      name: 'A Driver',
      nationality: null,
      stats,
      seasons: [
        season(1991, 'Jordan', 9),
        season(1991, 'Benetton', 9),
        season(1992, 'Benetton', 3),
      ],
      currentYear,
    })
    expect(text).toContain('spans 2 seasons between 1991 and 1992')
  })

  it('names only what a career achieved', () => {
    const text = driverSummary({
      name: 'A Driver',
      nationality: null,
      stats: { total_races: 1, wins: 0, podiums: 0, poles: 0, championships: 0 },
      seasons: [season(1959, 'Cooper', 78)],
      currentYear,
    })
    expect(text).toContain('is a single season, 1959, with Cooper.')
    expect(text).toContain('1 start, with no win or podium.')
  })

  it('keeps earlier titles when the current season is also led', () => {
    const text = driverSummary({
      name: 'A Driver',
      nationality: null,
      stats: { ...stats, championships: 1 },
      seasons: [season(2020, 'X', 1), season(2026, 'X', 1)],
      currentYear,
    })
    expect(text).toContain('World champion in 2020.')
    expect(text).not.toContain('2026.')
  })

  it('reports the best finish for a driver with no title', () => {
    const text = driverSummary({
      name: 'A Driver',
      nationality: null,
      stats: { ...stats, championships: 0 },
      seasons: [season(2001, 'X', 7), season(2002, 'X', 2)],
      currentYear,
    })
    expect(text).toContain('Best championship finish: P2 in 2002.')
  })

  it('handles a driver who never started', () => {
    const text = driverSummary({
      name: 'A Driver',
      nationality: 'Thai',
      stats: { ...stats, total_races: 0 },
      seasons: [],
      currentYear,
    })
    expect(text).toContain('no World Championship race start')
  })

  it('never uses a gendered pronoun', () => {
    const text = driverSummary({
      name: 'A Driver',
      nationality: null,
      stats,
      seasons: [season(2001, 'X', 1)],
      currentYear,
    })
    expect(text).not.toMatch(/\b(he|she|his|her)\b/i)
  })
})

describe('constructorSummary', () => {
  const row = (year: number, wins: number, pos: number | null) => ({
    year,
    races: 10,
    wins,
    podiums: 1,
    points: 5,
    championshipPosition: pos,
  })

  it('reports the record and never a title, which the standings cannot support', () => {
    const text = constructorSummary({
      name: 'Ferrari',
      nationality: 'Italian',
      stats: { total_entries: 1143, wins: 250, podiums: 849 },
      seasons: [row(2008, 8, 1), row(2004, 15, 1)],
    })
    expect(text).toContain("Italian team Ferrari's Formula 1 history spans 2 seasons")
    expect(text).toContain('1,143 race entries brought 250 wins and 849 podiums.')
    expect(text).toContain('Most wins in one season: 15, in 2004.')
    expect(text).not.toMatch(/champion/i)
  })
})

describe('circuitSummary', () => {
  const stats = (rows: [string, number][]) =>
    ({
      mostWins: rows.map(([lastName, count]) => ({
        driver: { firstName: 'A', lastName },
        count,
      })),
    }) as never

  it('reports a tie as a tie', () => {
    const text = circuitSummary({
      name: 'Monza',
      location: 'Monza',
      country: 'Italy',
      raceYears: [1950, 2025, 1999],
      stats: stats([
        ['Schumacher', 5],
        ['Hamilton', 5],
        ['Piquet', 3],
      ]),
    })
    expect(text).toContain('Monza in Monza, Italy has hosted 3 Formula 1 Grands Prix')
    expect(text).toContain('A Schumacher and A Hamilton share the most wins here, with 5 each.')
  })

  it('says nothing about a record nobody has repeated', () => {
    const text = circuitSummary({
      name: 'Pescara',
      location: null,
      country: null,
      raceYears: [1957],
      stats: stats([['Moss', 1]]),
    })
    expect(text).toBe('Pescara hosted Formula 1 once, in 1957.')
  })
})

describe('seasonSummary', () => {
  const rounds = (winners: (string | null)[]) =>
    winners.map((w, i) => ({
      round: i + 1,
      name: `GP ${i + 1}`,
      winner: w ? { driver: { ref: w } } : null,
    })) as unknown as SeasonCalendarResponse['rounds']
  const drivers = [
    {
      position: 1,
      points: 395.5,
      driver: { firstName: 'Max', lastName: 'Verstappen' },
      constructor: { name: 'Red Bull' },
    },
    {
      position: 2,
      points: 387.5,
      driver: { firstName: 'Lewis', lastName: 'Hamilton' },
      constructor: { name: 'Mercedes' },
    },
  ]

  it('calls a finished season won', () => {
    const text = seasonSummary({
      year: 2021,
      calendar: { year: 2021, totalKm: 63214, rounds: rounds(['a', 'a', 'b']) },
      drivers,
    })
    expect(text).toContain('ran over 3 rounds, from the GP 1 to the GP 3, 63,214 km')
    expect(text).toContain(
      "Max Verstappen (Red Bull) won the drivers' championship on 395.5 points, 8 points ahead of Lewis Hamilton.",
    )
    expect(text).not.toMatch(/constructors/i)
    expect(text).toContain('2 different drivers won a race.')
  })

  it('calls a running season a lead, never a title', () => {
    const text = seasonSummary({
      year: 2026,
      calendar: { year: 2026, totalKm: 0, rounds: rounds(['a', null]) },
      drivers,
    })
    expect(text).toContain('After 1 of 2 rounds, Max Verstappen (Red Bull) leads')
    expect(text).not.toContain('won the drivers')
  })

  it('stops at the calendar before any race has run', () => {
    const text = seasonSummary({
      year: 2027,
      calendar: { year: 2027, totalKm: 0, rounds: rounds([null, null]) },
      drivers: [],
    })
    expect(text).toBe('The 2027 Formula 1 calendar has 2 rounds, from the GP 1 to the GP 2.')
  })
})

describe('raceSummary', () => {
  const entry = (position: number | null, firstName: string, grid = 3) => ({
    position,
    grid,
    driver: { firstName, lastName: 'X' },
    constructor: { name: `${firstName} Team` },
  })
  const base = {
    year: 2021,
    raceName: 'Abu Dhabi Grand Prix',
    circuit: { name: 'Yas Marina Circuit', location: 'Abu Dhabi' },
    fastestLap: null,
  }

  it('reports the result', () => {
    const text = raceSummary({
      ...base,
      results: [entry(1, 'A', 1), entry(2, 'B'), entry(3, 'C'), entry(null, 'D')],
      fastestLap: { time: '1:26.103', driver: { firstName: 'A', lastName: 'X' } },
    })
    expect(text).toContain(
      'A X won the 2021 Abu Dhabi Grand Prix at Yas Marina Circuit in Abu Dhabi for A Team from pole position.',
    )
    expect(text).toContain('B X and C X completed the podium.')
    expect(text).toContain('A X set the fastest lap, a 1:26.103.')
    expect(text).toContain('3 of 4 entries were classified.')
  })

  it('reports a shared drive as shared', () => {
    const text = raceSummary({ ...base, results: [entry(1, 'A'), entry(1, 'B')] })
    expect(text).toContain('A X and B X shared the win')
  })

  it('has nothing to say about a race not yet run', () => {
    expect(raceSummary({ ...base, results: [] })).toBeNull()
  })
})

describe('head-to-head summaries', () => {
  const senna = { name: 'Ayrton Senna', lastName: 'Senna', wins: 41, starts: 162, championships: 3 }
  const prost = { name: 'Alain Prost', lastName: 'Prost', wins: 51, starts: 202, championships: 4 }

  it('leads with whoever came out ahead', () => {
    const text = driverPairSummary({
      one: senna,
      two: prost,
      race: { driver1Wins: 62, driver2Wins: 69, totalRaces: 142 },
      qualifying: { driver1Wins: 91, driver2Wins: 51, totalRaces: 142 },
      teammateSeasons: [1988, 1989],
    })
    expect(text).toContain('started 142 races together')
    expect(text).toContain("Prost finished ahead 69 times to Senna's 62.")
    expect(text).toContain("Senna was quicker 91 times to Prost's 51.")
    expect(text).toContain('teammates in 1988 and 1989')
  })

  it('says so when two eras never met', () => {
    const text = driverPairSummary({
      one: senna,
      two: prost,
      race: { driver1Wins: 0, driver2Wins: 0, totalRaces: 0 },
      qualifying: { driver1Wins: 0, driver2Wins: 0, totalRaces: 0 },
      teammateSeasons: [],
    })
    expect(text).toContain('never raced each other')
  })

  it('compares teams on the same terms', () => {
    const text = constructorPairSummary({
      one: { name: 'Ferrari', wins: 250, entries: 1143 },
      two: { name: 'McLaren', wins: 203, entries: 1000 },
      race: { constructor1Wins: 300, constructor2Wins: 300, totalRaces: 800 },
    })
    expect(text).toContain('Level at 300 each.')
  })
})

describe('rankingSummary', () => {
  const row = (rank: number, lastName: string, value: number) => ({
    rank,
    value,
    starts: 100,
    driver: { firstName: 'A', lastName },
  })
  const res = (data: unknown[], format: RecordsExploreResponse['format'] = 'integer') =>
    ({ data, format }) as RecordsExploreResponse
  const wins = {
    entity: 'drivers',
    slug: 'most-wins',
    category: 'wins',
    title: 't',
    unit: 'wins',
  } as const

  it('names the holder and the chasers', () => {
    const text = rankingSummary(wins, res([row(1, 'H', 106), row(2, 'S', 91), row(3, 'V', 70)]))
    expect(text).toBe(
      'A H holds the record with 106 wins. Next on the all-time list: A S (91) and A V (70).',
    )
  })

  it('reports a shared record as shared', () => {
    const text = rankingSummary(wins, res([row(1, 'H', 7), row(1, 'S', 7), row(3, 'F', 5)]))
    expect(text).toContain('A H and A S share the record with 7 wins.')
  })

  it('reads a rate as a percentage', () => {
    const rate = { ...wins, unit: undefined, rateLabel: 'win rate' }
    const text = rankingSummary(rate, res([row(1, 'F', 0.4615)], 'percent'))
    expect(text).toBe('A F holds the record with a 46.2% win rate.')
  })
})

describe('formatRecordValue', () => {
  it('keeps points decimals and groups thousands', () => {
    expect(formatRecordValue(0.4615, 'percent')).toBe('46.2%')
    expect(formatRecordValue(1234, 'integer')).toBe('1,234')
    expect(formatRecordValue(4639.5, 'decimal')).toBe('4,639.5')
    expect(formatRecordValue(4640, 'decimal')).toBe('4,640')
  })
})

describe('nationalitySummary', () => {
  it('reports winners', () => {
    const text = nationalitySummary({
      label: 'British',
      total: 173,
      winners: { total: 21, top: { name: 'Lewis Hamilton', wins: 106 } },
    })
    expect(text).toBe(
      '173 British drivers have entered the Formula 1 World Championship. 21 have won a race, led by Lewis Hamilton with 106 wins.',
    )
  })

  it('does not call a lone winner the leader of a group of one', () => {
    const text = nationalitySummary({
      label: 'Monégasque',
      total: 5,
      winners: { total: 1, top: { name: 'Charles Leclerc', wins: 9 } },
    })
    expect(text).toContain('Only Charles Leclerc has won a race, with 9 wins.')
  })

  it('reports none', () => {
    const text = nationalitySummary({
      label: 'Danish',
      total: 6,
      winners: { total: 0, top: null },
    })
    expect(text).toContain('None has won a race.')
  })
})
