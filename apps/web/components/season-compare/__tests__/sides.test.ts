import { describe, expect, it } from 'vitest'
import { describeSides } from '@/components/season-compare/sides'
import type { SeasonCompareResponse } from '@/lib/types'

const response = (a: string | null, b: string | null) =>
  ({
    type: 'constructors',
    a: { id: 'a', ref: 'a', name: 'A', color: a },
    b: { id: 'b', ref: 'b', name: 'B', color: b },
  }) as unknown as SeasonCompareResponse

describe('describeSides', () => {
  it('keeps each team colour', () => {
    const [a, b] = describeSides(response('#00D7B6', '#ED1131'))
    expect([a.color, b.color]).toEqual(['#00D7B6', '#ED1131'])
  })

  it('tints side B lighter when both share a livery', () => {
    const [a, b] = describeSides(response('#00D7B6', '#00D7B6'))
    expect(a.color).toBe('#00D7B6')
    expect(b.color).not.toBe('#00D7B6')
  })

  it('falls back to the side tokens rather than grey when a team has no colour', () => {
    const [a, b] = describeSides(response(null, null))
    expect(a.color).toBe('var(--side-a)')
    expect(b.color).toBe('var(--side-b)')
  })
})
