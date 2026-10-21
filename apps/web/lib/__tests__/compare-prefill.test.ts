import { describe, expect, it } from 'vitest'
import { compareHref, comparePrefill } from '@/lib/compare-prefill'

const params = (q: string) => new URLSearchParams(q)

describe('comparePrefill', () => {
  it('prefills driver 1 on the drivers tab, with its name', () => {
    expect(comparePrefill(params('d1=lewis-hamilton&d1name=Lewis%20Hamilton'))).toEqual({
      tab: 0,
      d1: { ref: 'lewis-hamilton', name: 'Lewis Hamilton' },
      c1: { ref: '', name: '' },
    })
  })

  it('opens the constructors tab for a constructor prefill', () => {
    expect(comparePrefill(params('c1=ferrari&c1name=Ferrari'))).toEqual({
      tab: 1,
      d1: { ref: '', name: '' },
      c1: { ref: 'ferrari', name: 'Ferrari' },
    })
  })

  it('falls back to the ref as the name for older links', () => {
    expect(comparePrefill(params('d1=lewis-hamilton')).d1).toEqual({
      ref: 'lewis-hamilton',
      name: 'lewis-hamilton',
    })
  })

  it('is empty on the drivers tab with no params', () => {
    expect(comparePrefill(params(''))).toEqual({
      tab: 0,
      d1: { ref: '', name: '' },
      c1: { ref: '', name: '' },
    })
  })
})

describe('compareHref', () => {
  it('encodes the name alongside the ref', () => {
    expect(compareHref('driver', 'kimi-antonelli', 'Kimi Antonelli')).toBe(
      '/compare?d1=kimi-antonelli&d1name=Kimi+Antonelli',
    )
    expect(compareHref('constructor', 'red-bull', 'Red Bull')).toBe(
      '/compare?c1=red-bull&c1name=Red+Bull',
    )
  })
})
