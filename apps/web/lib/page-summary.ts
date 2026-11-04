import type {
  CircuitStats,
  ConstructorSeasonSummary,
  DriverSeasonSummary,
  RecordsExploreResponse,
  SeasonCalendarResponse,
} from '@/lib/types'
import type { RecordRanking } from '@/lib/seo-landing'

/**
 * One paragraph per detail page, written from that page's own data, so ~2,500
 * pages built from a handful of templates each say something no other page says.
 *
 * Everything is a pure function of its arguments and goes into cached HTML, so
 * nothing here reads a clock or a locale (`group()` rather than `toLocaleString`).
 * The wording never uses a pronoun for a driver: the data does not say.
 */

/** 63214 -> "63,214". A fixed format, so a regeneration cannot change the bytes. */
export function group(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** 395.5 stays, 386.00 -> "386", and thousands group as `group()` does. */
function points(n: number): string {
  const [whole, fraction] = String(Math.round(n * 100) / 100).split('.')
  return fraction ? `${group(Number(whole))}.${fraction}` : group(Number(whole))
}

const plural = (n: number, one: string, many = `${one}s`) => `${group(n)} ${n === 1 ? one : many}`

/** ["a", "b", "c"] -> "a, b and c". */
export function listOf(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/**
 * "spans 11 seasons between 1984 and 1994". Present tense, so it reads true of a
 * career that is over and one that is not. Years are deduplicated: a driver who
 * changed teams mid-season has two rows for that year.
 */
function careerSpan(years: readonly number[]): string {
  const distinct = new Set(years)
  const first = Math.min(...years)
  const last = Math.max(...years)
  if (distinct.size === 1) return `is a single season, ${first}`
  return `spans ${plural(distinct.size, 'season')} between ${first} and ${last}`
}

/** "12 starts brought 3 podiums", naming only what there was to name. */
function tally(base: string, achievements: readonly [number, string, string?][]): string {
  const earned = achievements.filter(([n]) => n > 0).map(([n, one, many]) => plural(n, one, many))
  return earned.length > 0
    ? `${base} brought ${listOf(earned)}.`
    : `${base}, with no win or podium.`
}

/** A title list, capped so a five-time champion's sentence stays a sentence. */
function capped(names: readonly string[], max: number): string {
  if (names.length <= max) return listOf(names)
  return `${names.slice(0, max).join(', ')} and ${plural(names.length - max, 'other')}`
}

export function driverSummary(input: {
  name: string
  nationality: string | null
  stats: {
    total_races: number
    wins: number
    podiums: number
    poles: number
    championships: number
  }
  seasons: readonly DriverSeasonSummary[]
  /** A season this recent may still be running, so its table is not yet a result. */
  currentYear: number
}): string {
  const { name, nationality, stats, seasons, currentYear } = input
  const who = nationality ? `${nationality} driver ${name}` : name

  if (seasons.length === 0 || stats.total_races === 0) {
    return `${who} is in the Formula 1 record but has no World Championship race start.`
  }

  const chronological = [...seasons].sort((a, b) => a.year - b.year)
  const teams = [
    ...new Set(chronological.flatMap((s) => (s.constructor ? [s.constructor.name] : []))),
  ]
  const opening = `${who}'s Formula 1 career ${careerSpan(chronological.map((s) => s.year))}${
    teams.length > 0 ? `, with ${capped(teams, 5)}` : ''
  }.`
  const winRate =
    stats.wins > 0 ? ` (${((stats.wins / stats.total_races) * 100).toFixed(1)}% of starts)` : ''
  const record = tally(plural(stats.total_races, 'start'), [
    [stats.wins, `win${winRate}`, `wins${winRate}`],
    [stats.poles, 'pole position'],
    [stats.podiums, 'podium'],
  ])

  return [opening, record, driverPeak(stats.championships, chronological, currentYear)]
    .filter(Boolean)
    .join(' ')
}

function driverPeak(
  championships: number,
  chronological: readonly DriverSeasonSummary[],
  currentYear: number,
): string {
  // `championshipPosition` is 1 for whoever leads a season still running. The
  // title count comes from the official table, so taking that many from the
  // oldest end leaves out a lead that is not yet a title.
  const titles = [
    ...new Set(chronological.filter((s) => s.championshipPosition === 1).map((s) => s.year)),
  ].slice(0, championships)
  if (titles.length > 0) {
    return `World champion ${titles.length === 1 ? 'in' : `${titles.length} times:`} ${listOf(titles.map(String))}.`
  }
  const finished = chronological.filter(
    (s) => s.championshipPosition !== null && s.year < currentYear,
  )
  if (finished.length === 0) return ''
  const best = finished.reduce((a, b) =>
    (b.championshipPosition as number) < (a.championshipPosition as number) ? b : a,
  )
  return `Best championship finish: P${best.championshipPosition} in ${best.year}.`
}

/** The first constructors' title. A table before this year only sums points. */
const FIRST_CONSTRUCTORS_CHAMPIONSHIP = 1958

export function constructorSummary(input: {
  name: string
  nationality: string | null
  stats: { total_entries: number; wins: number; podiums: number }
  seasons: readonly ConstructorSeasonSummary[]
  /** Seasons before this are over, so a P1 in one of them is a title and not a lead. */
  currentYear: number
}): string {
  const { name, nationality, stats, seasons, currentYear } = input
  const who = nationality ? `${nationality} team ${name}` : name
  if (seasons.length === 0) return `${who} is in the Formula 1 record with no race entry.`

  const best = seasons.reduce((a, b) => (b.wins > a.wins ? b : a))
  const titles = seasons
    .filter(
      (s) =>
        s.championshipPosition === 1 &&
        s.year >= FIRST_CONSTRUCTORS_CHAMPIONSHIP &&
        s.year < currentYear,
    )
    .map((s) => s.year)
    .sort((a, b) => a - b)
  const parts = [
    `${who}'s Formula 1 history ${careerSpan(seasons.map((s) => s.year))}.`,
    tally(plural(stats.total_entries, 'race entry', 'race entries'), [
      [stats.wins, 'win'],
      [stats.podiums, 'podium'],
    ]),
  ]
  if (best.wins > 0) {
    parts.push(`Most wins in one season: ${group(best.wins)}, in ${best.year}.`)
  }
  if (titles.length > 0) {
    parts.push(
      `Constructors' champion ${
        titles.length === 1
          ? `in ${titles[0]}`
          : `${titles.length} times, most recently in ${titles[titles.length - 1]}`
      }.`,
    )
  }
  return parts.join(' ')
}

export function circuitSummary(input: {
  name: string
  location: string | null
  country: string | null
  raceYears: readonly number[]
  stats: CircuitStats | null
}): string {
  const { name, location, country, raceYears, stats } = input
  const where = [location, country].filter(Boolean).join(', ')
  const at = where ? `${name} in ${where}` : name
  if (raceYears.length === 0) return `${at} is in the Formula 1 record with no Grand Prix yet.`

  const first = Math.min(...raceYears)
  const last = Math.max(...raceYears)
  const parts = [
    first === last
      ? `${at} hosted Formula 1 once, in ${first}.`
      : `${at} has hosted ${plural(raceYears.length, 'Formula 1 Grand Prix', 'Formula 1 Grands Prix')} between ${first} and ${last}.`,
  ]

  const top = stats?.mostWins[0]?.count
  if (stats && top && top > 1) {
    const leaders = stats.mostWins
      .filter((row) => row.count === top)
      .map((row) => `${row.driver.firstName} ${row.driver.lastName}`)
    parts.push(
      leaders.length === 1
        ? `${leaders[0]} has won here the most, ${plural(top, 'time')}.`
        : `${capped(leaders, 3)} share the most wins here, with ${group(top)} each.`,
    )
  }
  return parts.join(' ')
}

interface StandingRow {
  points: number
  position: number | null
}

/** "8 points ahead of X", or that the two finished level. */
function margin(leader: StandingRow, second: StandingRow | undefined, secondName?: string) {
  if (!second || !secondName) return ''
  const gap = leader.points - second.points
  if (gap === 0) return `, level on points with ${secondName}`
  return `, ${points(gap)} ${gap === 1 ? 'point' : 'points'} ahead of ${secondName}`
}

export function seasonSummary(input: {
  year: number
  calendar: SeasonCalendarResponse
  drivers: readonly (StandingRow & {
    driver: { firstName: string; lastName: string }
    constructor: { name: string } | null
  })[]
  constructors: readonly (StandingRow & { constructor: { name: string } })[]
}): string | null {
  const { year, calendar, drivers, constructors } = input
  const { rounds, totalKm } = calendar
  if (rounds.length === 0) return null

  const run = rounds.filter((r) => r.winner !== null)
  const complete = run.length === rounds.length
  const route = `from the ${rounds[0].name} to the ${rounds[rounds.length - 1].name}`
  const travel = totalKm > 0 ? `, ${group(totalKm)} km of travel between circuits` : ''
  const opening = complete
    ? `The ${year} Formula 1 season ran over ${plural(rounds.length, 'round')}, ${route}${travel}.`
    : `The ${year} Formula 1 calendar has ${plural(rounds.length, 'round')}, ${route}${travel}.`
  if (run.length === 0) return opening

  const name = (row: (typeof drivers)[number]) => `${row.driver.firstName} ${row.driver.lastName}`
  const champion = drivers.find((d) => d.position === 1)
  const second = drivers.find((d) => d.position === 2)
  const hasTitle = year >= FIRST_CONSTRUCTORS_CHAMPIONSHIP
  const team = hasTitle ? constructors.find((c) => c.position === 1) : undefined
  const teamSecond = constructors.find((c) => c.position === 2)
  const parts = [opening]

  if (champion) {
    const car = champion.constructor ? ` (${champion.constructor.name})` : ''
    const gap = margin(champion, second, second && name(second))
    parts.push(
      complete
        ? `${name(champion)}${car} won the drivers' championship on ${points(champion.points)} points${gap}.`
        : `After ${run.length} of ${rounds.length} rounds, ${name(champion)}${car} leads the drivers' championship on ${points(champion.points)} points${gap}.`,
    )
  }
  if (team) {
    const gap = margin(team, teamSecond, teamSecond?.constructor.name)
    parts.push(
      complete
        ? `${team.constructor.name} took the constructors' title on ${points(team.points)} points${gap}.`
        : `${team.constructor.name} leads the constructors' championship on ${points(team.points)} points${gap}.`,
    )
  }
  const winners = new Set(run.map((r) => r.winner?.driver.ref))
  parts.push(`${plural(winners.size, 'different driver')} won a race.`)
  return parts.join(' ')
}

export function raceSummary(input: {
  year: number
  raceName: string
  circuit: { name: string; location: string | null }
  results: readonly {
    position: number | null
    grid: number
    driver: { firstName: string; lastName: string }
    constructor: { name: string }
  }[]
  fastestLap: { time: string | null; driver: { firstName: string; lastName: string } } | null
}): string | null {
  const { year, raceName, circuit, results, fastestLap } = input
  const winners = results.filter((r) => r.position === 1)
  // Not run yet: the page's schedule already says everything there is to say.
  if (winners.length === 0) return null

  const name = (d: { firstName: string; lastName: string }) => `${d.firstName} ${d.lastName}`
  const place = circuit.location ? `${circuit.name} in ${circuit.location}` : circuit.name
  const parts: string[] = []

  if (winners.length > 1) {
    // Shared drives in the 1950s classify two drivers first.
    parts.push(
      `${listOf(winners.map((w) => name(w.driver)))} shared the win in the ${year} ${raceName} at ${place}.`,
    )
  } else {
    const [winner] = winners
    const from =
      winner.grid === 1 ? ' from pole position' : winner.grid > 1 ? ` from P${winner.grid}` : ''
    parts.push(
      `${name(winner.driver)} won the ${year} ${raceName} at ${place} for ${winner.constructor.name}${from}.`,
    )
  }

  const onPodium = (position: number) =>
    results.find((r) => r.position === position)?.driver as
      | { firstName: string; lastName: string }
      | undefined
  const second = onPodium(2)
  const third = onPodium(3)
  if (second && third) parts.push(`${name(second)} and ${name(third)} completed the podium.`)
  if (fastestLap?.time) {
    parts.push(`${name(fastestLap.driver)} set the fastest lap, a ${fastestLap.time}.`)
  }
  const classified = results.filter((r) => r.position !== null).length
  parts.push(
    `${group(classified)} of ${plural(results.length, 'entry', 'entries')} were classified.`,
  )
  return parts.join(' ')
}

export function driverPairSummary(input: {
  one: { name: string; lastName: string; wins: number; starts: number; championships: number }
  two: { name: string; lastName: string; wins: number; starts: number; championships: number }
  race: { driver1Wins: number; driver2Wins: number; totalRaces: number }
  qualifying: { driver1Wins: number; driver2Wins: number; totalRaces: number }
  teammateSeasons: readonly number[]
}): string {
  const { one, two, race, qualifying, teammateSeasons } = input
  const career = `${one.name} has ${plural(one.wins, 'win')} and ${plural(one.championships, 'title')} from ${plural(one.starts, 'start')}; ${two.name} has ${plural(two.wins, 'win')} and ${plural(two.championships, 'title')} from ${plural(two.starts, 'start')}.`
  if (race.totalRaces === 0) return `${one.name} and ${two.name} never raced each other. ${career}`

  const parts = [
    `${one.name} and ${two.name} started ${plural(race.totalRaces, 'race')} together. ${duel(one.lastName, two.lastName, race.driver1Wins, race.driver2Wins, 'finished ahead')}`,
  ]
  if (qualifying.totalRaces > 0) {
    parts.push(
      `In qualifying: ${duel(one.lastName, two.lastName, qualifying.driver1Wins, qualifying.driver2Wins, 'was quicker')}`,
    )
  }
  if (teammateSeasons.length > 0) {
    parts.push(`They were teammates in ${listOf(teammateSeasons.map(String))}.`)
  }
  parts.push(career)
  return parts.join(' ')
}

function duel(a: string, b: string, aWins: number, bWins: number, verb: string): string {
  if (aWins === bWins) return `Level at ${group(aWins)} each.`
  const [lead, leadWins, trail, trailWins] =
    aWins > bWins ? [a, aWins, b, bWins] : [b, bWins, a, aWins]
  return `${lead} ${verb} ${plural(leadWins, 'time')} to ${trail}'s ${group(trailWins)}.`
}

export function constructorPairSummary(input: {
  one: { name: string; wins: number; entries: number }
  two: { name: string; wins: number; entries: number }
  race: { constructor1Wins: number; constructor2Wins: number; totalRaces: number }
}): string {
  const { one, two, race } = input
  const career = `${one.name} has ${plural(one.wins, 'win')} from ${plural(one.entries, 'race entry', 'race entries')}; ${two.name} has ${plural(two.wins, 'win')} from ${plural(two.entries, 'race entry', 'race entries')}.`
  if (race.totalRaces === 0) return `${one.name} and ${two.name} never raced each other. ${career}`
  return `${one.name} and ${two.name} have met in ${plural(race.totalRaces, 'race')}. ${duel(one.name, two.name, race.constructor1Wins, race.constructor2Wins, 'had the better result')} ${career}`
}

/** A value as its category reads: a count, a points total or a percentage. */
export function formatRecordValue(value: number, format: RecordsExploreResponse['format']): string {
  if (format === 'percent') return `${(value * 100).toFixed(1)}%`
  if (format === 'decimal') return points(value)
  return group(value)
}

const rowName = (row: RecordsExploreResponse['data'][number]) =>
  row.driver ? `${row.driver.firstName} ${row.driver.lastName}` : (row.constructor?.name ?? '')

export function rankingSummary(ranking: RecordRanking, res: RecordsExploreResponse): string {
  const [leader] = res.data
  if (!leader) return ''
  const shown = (v: number) => {
    const text = formatRecordValue(v, res.format)
    return ranking.unit ? `${text} ${ranking.unit}` : `a ${text} ${ranking.rateLabel}`
  }
  const tied = res.data.filter((row) => row.value === leader.value).map(rowName)
  const chasers = res.data.filter((row) => row.value !== leader.value).slice(0, 2)
  const lead =
    tied.length > 1
      ? `${capped(tied, 4)} share the record with ${shown(leader.value)}.`
      : `${tied[0]} holds the record with ${shown(leader.value)}.`
  if (chasers.length === 0) return lead
  const rest = chasers
    .map((row) => `${rowName(row)} (${formatRecordValue(row.value, res.format)})`)
    .join(' and ')
  return `${lead} Next on the all-time list: ${rest}.`
}

export function nationalitySummary(input: {
  label: string
  total: number
  winners: { total: number; top: { name: string; wins: number } | null }
}): string {
  const { label, total, winners } = input
  const entered = `${plural(total, `${label} driver`)} ${total === 1 ? 'has' : 'have'} entered the Formula 1 World Championship.`
  if (!winners.top) return `${entered} None has won a race.`
  const { name, wins } = winners.top
  if (winners.total === 1)
    return `${entered} Only ${name} has won a race, with ${plural(wins, 'win')}.`
  return `${entered} ${group(winners.total)} have won a race, led by ${name} with ${plural(wins, 'win')}.`
}
