import { describe, expect, it } from 'vitest'
import {
  CURATED_CONSTRUCTOR_PAIRS,
  CURATED_DRIVER_PAIRS,
  findPair,
  pairHref,
  pairSlug,
  pairsFor,
} from './curated-comparisons'
import {
  NATIONALITY_PAGES,
  RECORD_RANKINGS,
  findNationalityBySlug,
  findRanking,
  rankingHref,
} from './seo-landing'

const unique = (items: readonly string[]) => new Set(items).size === items.length

describe('curated comparisons', () => {
  it.each([
    ['drivers', CURATED_DRIVER_PAIRS],
    ['constructors', CURATED_CONSTRUCTOR_PAIRS],
  ] as const)('%s lists each pairing once, in one order', (_kind, pairs) => {
    expect(unique(pairs.map((p) => [p.a, p.b].sort().join('|')))).toBe(true)
    expect(pairs.every((p) => p.a !== p.b)).toBe(true)
  })

  it('stays small enough to cache, which is the reason it exists', () => {
    expect(CURATED_DRIVER_PAIRS.length + CURATED_CONSTRUCTOR_PAIRS.length).toBeLessThanOrEqual(100)
  })

  it('round-trips a URL and refuses anything off the list', () => {
    const [first] = CURATED_DRIVER_PAIRS
    expect(findPair('drivers', pairSlug(first))).toBe(first)
    expect(pairHref('drivers', first)).toBe('/compare/drivers/lewis-hamilton-vs-max-verstappen')
    expect(findPair('drivers', 'max-verstappen-vs-lewis-hamilton')).toBeUndefined()
  })

  it('finds a driver on either side of a pair', () => {
    const labels = pairsFor('drivers', 'alain-prost').map((p) => p.label)
    expect(labels).toEqual(['Senna vs Prost', 'Prost vs Lauda'])
  })
})

describe('landing pages', () => {
  it('has unique URLs', () => {
    expect(unique(RECORD_RANKINGS.map(rankingHref))).toBe(true)
    expect(unique(NATIONALITY_PAGES.map((n) => n.slug))).toBe(true)
  })

  it('finds a ranking by its route params', () => {
    expect(findRanking('drivers', 'most-wins')?.category).toBe('wins')
    expect(findRanking('teams', 'most-car-entries')?.category).toBe('starts')
    expect(findRanking('teams', 'highest-win-rate')).toBeUndefined()
  })

  it('every ranking can describe its value', () => {
    expect(RECORD_RANKINGS.every((r) => r.unit || r.rateLabel)).toBe(true)
  })

  it('keeps the API spelling of a nationality, which its filter matches on', () => {
    expect(findNationalityBySlug('monegasque')?.nationality).toBe('Monégasque')
    expect(findNationalityBySlug('new-zealand')?.nationality).toBe('New Zealander')
    expect(findNationalityBySlug('south-african')?.nationality).toBe('South African')
  })
})
