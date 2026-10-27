import { describe, expect, it } from 'vitest'
import { isSameOriginPath, tokenizeAnswer } from './engineer-markdown'

describe('tokenizeAnswer', () => {
  it('splits links, bold and line breaks', () => {
    expect(tokenizeAnswer('Max leads with **25**.\nSee [2024](/seasons/2024).')).toEqual([
      { type: 'text', value: 'Max leads with ' },
      { type: 'bold', value: '25' },
      { type: 'text', value: '.' },
      { type: 'break' },
      { type: 'text', value: 'See ' },
      { type: 'link', label: '2024', href: '/seasons/2024' },
      { type: 'text', value: '.' },
    ])
  })
  it('leaves a half-typed link as text while streaming', () => {
    expect(tokenizeAnswer('See [2024](/sea')).toEqual([{ type: 'text', value: 'See [2024](/sea' }])
  })
  it('leaves an unclosed bold and a bare bracket as text', () => {
    expect(tokenizeAnswer('a **bol')).toEqual([{ type: 'text', value: 'a **bol' }])
    expect(tokenizeAnswer('[2024]')).toEqual([{ type: 'text', value: '[2024]' }])
  })
  it('returns nothing for empty input', () => {
    expect(tokenizeAnswer('')).toEqual([])
  })
})

describe('isSameOriginPath', () => {
  it.each([
    ['/seasons/2024', true],
    ['/seasons/2024?type=drivers&a=x&b=y', true],
    ['//evil', false],
    ['https://evil', false],
    ['javascript:alert(1)', false],
    ['seasons', false],
    ['/\\evil.com', false],
    ['/\t/evil', false],
    ['/a//b', false],
  ])('%s → %s', (href, ok) => {
    expect(isSameOriginPath(href)).toBe(ok)
  })
})
