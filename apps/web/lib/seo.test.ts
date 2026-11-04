import { describe, expect, it } from 'vitest'
import { buildListMetadata, pageHref, raceSitemapEntry } from './seo'

const input = { title: 'F1 Drivers', description: 'd', path: '/drivers' }

describe('buildListMetadata', () => {
  it('leaves the first page on the bare path', () => {
    const meta = buildListMetadata(input, {})
    expect(meta.title).toBe('F1 Drivers')
    expect(meta.alternates?.canonical).toMatch(/\/drivers$/)
  })

  it('gives later pages their own title and self-referencing canonical', () => {
    const meta = buildListMetadata(input, { page: '3' })
    expect(meta.title).toBe('F1 Drivers, page 3')
    expect(meta.alternates?.canonical).toMatch(/\/drivers\?page=3$/)
  })

  it.each(['1', '0', '-2', '1.5', 'abc'])('treats page=%s as the first page', (page) => {
    expect(buildListMetadata(input, { page }).alternates?.canonical).toMatch(/\/drivers$/)
  })

  it('canonicalises a filtered list to the unfiltered one', () => {
    const meta = buildListMetadata(input, { page: '2', filter: 'British' })
    expect(meta.title).toBe('F1 Drivers')
    expect(meta.alternates?.canonical).toMatch(/\/drivers$/)
  })
})

describe('pageHref', () => {
  it('drops the parameter for page one, so it has one URL', () => {
    expect(pageHref('/drivers', 'page=4', 1)).toBe('/drivers')
  })

  it('keeps active filters', () => {
    expect(pageHref('/drivers', 'nationality=British&page=4', 2)).toBe(
      '/drivers?nationality=British&page=2',
    )
  })
})

describe('raceSitemapEntry', () => {
  const now = Date.parse('2026-11-04')

  it('builds the URL from the season, as the listing carries no year', () => {
    const entry = raceSitemapEntry(2021, { round: 22, date: '2021-12-12' }, now)
    expect(entry.url).toMatch(/\/seasons\/2021\/races\/22$/)
    expect(entry.lastModified).toEqual(new Date('2021-12-12'))
  })

  it('gives a race not yet run no lastmod', () => {
    const entry = raceSitemapEntry(2026, { round: 24, date: '2026-12-06' }, now)
    expect(entry.lastModified).toBeUndefined()
  })
})
