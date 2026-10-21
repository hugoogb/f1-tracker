import { describe, expect, it } from 'vitest'
import { isCurrentFor, paletteGroupOrder } from '@/lib/palette'

describe('paletteGroupOrder', () => {
  it('puts people before pages unless a page title starts with the query', () => {
    // "ver" matches the Compare pages only by their "versus" keyword.
    const order = paletteGroupOrder('ver', false)
    expect(order.indexOf('drivers')).toBeLessThan(order.indexOf('pages'))
  })

  it('leads with pages on a title-prefix match', () => {
    expect(paletteGroupOrder('rec', true)[0]).toBe('pages')
  })

  it('leads with seasons and races when a year is typed', () => {
    const order = paletteGroupOrder('monaco 2021', false)
    expect(order.slice(0, 2)).toEqual(['seasons', 'races'])
  })
})

describe('isCurrentFor', () => {
  it('only treats results as current for the query they answered', () => {
    expect(isCurrentFor('ham', { forQuery: 'ham' })).toBe(true)
    expect(isCurrentFor('hami', { forQuery: 'ham' })).toBe(false)
    expect(isCurrentFor('ham', { forQuery: null })).toBe(false)
  })
})
