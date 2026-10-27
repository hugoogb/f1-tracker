import { describe, expect, it } from 'vitest'
import { suggestedPrompts } from './engineer-prompts'

describe('suggestedPrompts', () => {
  it('is page-aware', () => {
    expect(suggestedPrompts('/')[0]).toBe('Who is leading right now?')
    expect(suggestedPrompts('/seasons/2024')[0]).toBe('Who can still win the title?')
    expect(suggestedPrompts('/seasons/2024/races/5')[0]).toBe('Who gained the most places?')
    expect(suggestedPrompts('/attributions')).toHaveLength(3)
  })
  it.each([
    '/',
    '/seasons/2024',
    '/seasons/2024/races/5',
    '/seasons/2024/compare',
    '/drivers/max-verstappen',
    '/constructors/ferrari',
    '/circuits/monaco',
    '/records',
    '/best-seasons',
    '/compare/drivers',
    '/nowhere',
  ])('gives three distinct prompts for %s', (path) => {
    const prompts = suggestedPrompts(path)
    expect(prompts).toHaveLength(3)
    expect(new Set(prompts).size).toBe(3)
    for (const p of prompts) expect(p.length).toBeGreaterThan(0)
  })
})
