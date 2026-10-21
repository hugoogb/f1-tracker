import { describe, expect, it } from 'vitest'
import { searchPages } from '@/lib/site-pages'

describe('searchPages', () => {
  it('ranks a title-prefix match first', () => {
    expect(searchPages('rec')[0].href).toBe('/records')
  })

  it('matches keywords as well as titles', () => {
    expect(searchPages('best').map((p) => p.href)).toContain('/best-seasons')
    expect(searchPages('head to head').map((p) => p.href)).toContain('/compare')
  })

  it('is case-insensitive', () => {
    expect(searchPages('CIRCUITS')[0].href).toBe('/circuits')
  })

  it('finds nothing for nonsense or an empty query', () => {
    expect(searchPages('zzz')).toEqual([])
    expect(searchPages('')).toEqual([])
    expect(searchPages('   ')).toEqual([])
  })

  it('respects the limit', () => {
    expect(searchPages('s', 2).length).toBeLessThanOrEqual(2)
  })
})
