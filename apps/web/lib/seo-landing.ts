import type { RecordsExploreCategory } from '@/lib/types'

/**
 * Landing pages for searches the site could already answer but had no URL for.
 * Both lists are fixed so the cached pages stay bounded, and a later ingest cannot
 * mint a thin page by adding the first driver of a new nationality.
 */
export type RankingEntity = 'drivers' | 'teams'

export interface RecordRanking {
  entity: RankingEntity
  slug: string
  category: RecordsExploreCategory
  /** The title and heading, without the site suffix. */
  title: string
  /** Lower-case, for "holds the record with 106 wins". Absent for a rate. */
  unit?: string
  /** "win rate", for a percentage category. */
  rateLabel?: string
}

const driver = (
  slug: string,
  category: RecordsExploreCategory,
  title: string,
  measure: { unit?: string; rateLabel?: string },
): RecordRanking => ({ entity: 'drivers', slug, category, title, ...measure })

const team = (
  slug: string,
  category: RecordsExploreCategory,
  title: string,
  unit: string,
): RecordRanking => ({ entity: 'teams', slug, category, title, unit })

export const RECORD_RANKINGS: readonly RecordRanking[] = [
  driver('most-wins', 'wins', 'Most F1 Wins by a Driver', { unit: 'wins' }),
  driver('most-pole-positions', 'poles', 'Most F1 Pole Positions by a Driver', {
    unit: 'pole positions',
  }),
  driver('most-podiums', 'podiums', 'Most F1 Podiums by a Driver', { unit: 'podiums' }),
  driver('most-world-championships', 'championships', 'Most F1 World Championships by a Driver', {
    unit: 'world championships',
  }),
  driver('most-fastest-laps', 'fastest_laps', 'Most F1 Fastest Laps by a Driver', {
    unit: 'fastest laps',
  }),
  driver('most-race-starts', 'starts', 'Most F1 Race Starts by a Driver', { unit: 'race starts' }),
  driver('most-points', 'points', 'Most F1 Career Points by a Driver', { unit: 'points' }),
  driver('highest-win-rate', 'win_rate', 'Highest F1 Win Rate by a Driver', {
    rateLabel: 'win rate',
  }),
  driver('highest-podium-rate', 'podium_rate', 'Highest F1 Podium Rate by a Driver', {
    rateLabel: 'podium rate',
  }),
  team('most-wins', 'wins', 'Most F1 Wins by a Team', 'wins'),
  team('most-pole-positions', 'poles', 'Most F1 Pole Positions by a Team', 'pole positions'),
  team('most-podiums', 'podiums', 'Most F1 Podiums by a Team', 'podiums'),
  team(
    'most-constructors-championships',
    'championships',
    "Most F1 Constructors' Championships",
    "constructors' championships",
  ),
  team('most-fastest-laps', 'fastest_laps', 'Most F1 Fastest Laps by a Team', 'fastest laps'),
  team('most-points', 'points', 'Most F1 Points by a Team', 'points'),
  team('most-car-entries', 'starts', 'Most F1 Car Entries by a Team', 'car entries'),
]

export const rankingHref = (r: RecordRanking) => `/records/${r.entity}/${r.slug}`

export const findRanking = (entity: string, slug: string) =>
  RECORD_RANKINGS.find((r) => r.entity === entity && r.slug === slug)

export interface NationalityPage {
  slug: string
  /** Exactly as the API spells it, which is what its filter matches. */
  nationality: string
  /** How a headline reads it: "New Zealand F1 drivers", not "New Zealander". */
  label: string
}

const same = (nationality: string, slug = nationality.toLowerCase().replace(/ /g, '-')) => ({
  slug,
  nationality,
  label: nationality,
})

/** Every nationality with at least five drivers; below that there is no page to read. */
export const NATIONALITY_PAGES: readonly NationalityPage[] = [
  same('British'),
  same('American'),
  same('Italian'),
  same('French'),
  same('German'),
  same('Brazilian'),
  same('Swiss'),
  same('Argentine'),
  same('Japanese'),
  same('Belgian'),
  same('South African'),
  same('Australian'),
  same('Spanish'),
  same('Dutch'),
  same('Canadian'),
  same('Austrian'),
  same('Swedish'),
  { slug: 'new-zealand', nationality: 'New Zealander', label: 'New Zealand' },
  same('Finnish'),
  same('Mexican'),
  same('Danish'),
  same('Irish'),
  same('Russian'),
  same('Monégasque', 'monegasque'),
  same('Venezuelan'),
]

export const nationalityHref = (n: NationalityPage) => `/drivers/nationality/${n.slug}`

export const findNationalityBySlug = (slug: string) =>
  NATIONALITY_PAGES.find((n) => n.slug === slug)

export const findNationalityPage = (nationality: string | null | undefined) =>
  NATIONALITY_PAGES.find((n) => n.nationality === nationality)
