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
  it('keeps a link inside bold a link', () => {
    expect(tokenizeAnswer('**[Max](/drivers/max)**')).toEqual([
      { type: 'link', label: 'Max', href: '/drivers/max', bold: true },
    ])
    expect(tokenizeAnswer('**Champion: [Max](/drivers/max) again**!')).toEqual([
      { type: 'bold', value: 'Champion: ' },
      { type: 'link', label: 'Max', href: '/drivers/max', bold: true },
      { type: 'bold', value: ' again' },
      { type: 'text', value: '!' },
    ])
  })
  it('returns nothing for empty input', () => {
    expect(tokenizeAnswer('')).toEqual([])
  })
  it('keeps stray markers between real markup as text', () => {
    expect(tokenizeAnswer('a * b [c] **d** [e](/f) *')).toEqual([
      { type: 'text', value: 'a * b [c] ' },
      { type: 'bold', value: 'd' },
      { type: 'text', value: ' ' },
      { type: 'link', label: 'e', href: '/f' },
      { type: 'text', value: ' *' },
    ])
  })
  it('tokenises a 20 kB answer', () => {
    const line = 'P1 [Max](/drivers/max_verstappen) took **pole** by 0.1s.\n'
    const text = line.repeat(Math.ceil(20_000 / line.length))
    expect(text.length).toBeGreaterThanOrEqual(20_000)
    const tokens = tokenizeAnswer(text)
    const lines = text.split('\n').length - 1
    // text, link, text, bold, text, break per line
    expect(tokens).toHaveLength(lines * 6)
    expect(tokens.filter((t) => t.type === 'link')).toHaveLength(lines)
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
    ['/../x', false],
    ['/seasons/../../x', false],
    ['/seasons/..', false],
    ['/..?a=1', false],
    ['/drivers/carlos-sainz-jr.', true],
  ])('%s → %s', (href, ok) => {
    expect(isSameOriginPath(href)).toBe(ok)
  })
})
