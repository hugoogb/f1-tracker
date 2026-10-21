import { describe, expect, it } from 'vitest'
import { NAV_GROUPS, isActiveHref } from '@/lib/nav'

describe('isActiveHref', () => {
  it('matches a section and the pages under it', () => {
    expect(isActiveHref('/drivers', '/drivers')).toBe(true)
    expect(isActiveHref('/drivers/lewis-hamilton', '/drivers')).toBe(true)
  })

  it('does not match a different section sharing a prefix', () => {
    expect(isActiveHref('/compare-something', '/compare')).toBe(false)
    expect(isActiveHref('/seasons/2021', '/seasons/current')).toBe(false)
  })

  it('matches home only on home', () => {
    expect(isActiveHref('/', '/')).toBe(true)
    expect(isActiveHref('/drivers', '/')).toBe(false)
  })
})

describe('NAV_GROUPS', () => {
  it('reaches every main section', () => {
    const hrefs = NAV_GROUPS.flatMap((g) => [g.href, ...(g.items ?? []).map((i) => i.href)])
    for (const href of [
      '/seasons/current',
      '/seasons',
      '/champions',
      '/best-seasons',
      '/drivers',
      '/constructors',
      '/circuits',
      '/records',
      '/compare',
    ]) {
      expect(hrefs).toContain(href)
    }
  })
})
