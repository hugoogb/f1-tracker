import { describe, expect, it } from 'vitest'
import { linkTarget } from './engineer-answer'

describe('linkTarget', () => {
  it('only site paths become links', () => {
    expect(linkTarget('/seasons/2024')).toBe('internal')
    expect(linkTarget('https://example.com')).toBe('text')
  })
})
