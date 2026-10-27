import { describe, expect, it } from 'vitest'
import {
  COOLDOWN_MS,
  DISABLED_MESSAGE,
  EMPTY_ANSWER,
  initialState,
  outgoingMessages,
  pagePath,
  pageTitleFrom,
  reduce,
  refusalStatus,
  sendBlocked,
} from './use-engineer'
import type { EngineerState } from './use-engineer'

describe('engineer reducer', () => {
  it('streams text into one assistant message and records the ledger id', () => {
    let s = reduce(initialState, { type: 'user', content: 'Who leads?' })
    s = reduce(s, {
      type: 'event',
      event: { event: 'tool', data: { name: 'get_standings', label: '2024 standings' } },
    })
    expect(s.status).toEqual({ kind: 'tool', label: '2024 standings' })
    s = reduce(s, { type: 'event', event: { event: 'text', data: { delta: 'Max ' } } })
    s = reduce(s, { type: 'event', event: { event: 'text', data: { delta: 'leads.' } } })
    s = reduce(s, { type: 'event', event: { event: 'done', data: { id: 'r1', outcome: 'ok' } } })
    expect(s.messages.filter((m) => m.role === 'assistant')).toHaveLength(1)
    expect(s.messages.at(-1)).toMatchObject({
      role: 'assistant',
      content: 'Max leads.',
      ledgerId: 'r1',
    })
    expect(s.status).toEqual({ kind: 'idle' })
  })
  it('maps a refusal by its detail code, not by the HTTP status alone', () => {
    const http = (status: number, code: string | null) =>
      reduce(initialState, { type: 'http', status, code }).status
    expect(http(503, 'budget')).toEqual({ kind: 'budget' })
    expect(http(503, 'disabled')).toEqual({ kind: 'error', message: DISABLED_MESSAGE })
    expect(http(429, 'rate_limited')).toEqual({ kind: 'cooldown' })
    expect(http(429, null)).toEqual({ kind: 'cooldown' })
    expect(http(503, null).kind).toBe('error')
    expect(http(500, null).kind).toBe('error')
    expect(refusalStatus(422, null)).toEqual({ kind: 'error', message: 'Request failed (422)' })
  })
  it('releases a cooldown back to idle and leaves other statuses alone', () => {
    const cooldown = reduce(initialState, { type: 'http', status: 429, code: 'rate_limited' })
    expect(reduce(cooldown, { type: 'release' }).status).toEqual({ kind: 'idle' })
    const budget = reduce(initialState, { type: 'http', status: 503, code: 'budget' })
    expect(reduce(budget, { type: 'release' }).status).toEqual({ kind: 'budget' })
  })
  it('an answer with no text gets a notice carrying its own ledger id', () => {
    let s = reduce(initialState, { type: 'user', content: 'a' })
    s = reduce(s, { type: 'event', event: { event: 'text', data: { delta: 'first' } } })
    s = reduce(s, { type: 'event', event: { event: 'done', data: { id: 'r1', outcome: 'ok' } } })
    s = reduce(s, { type: 'user', content: 'b' })
    s = reduce(s, { type: 'event', event: { event: 'done', data: { id: 'r2', outcome: 'ok' } } })
    const assistants = s.messages.filter((m) => m.role === 'assistant')
    expect(assistants[0]).toMatchObject({ content: 'first', ledgerId: 'r1' })
    expect(s.messages.at(-1)).toMatchObject({
      role: 'assistant',
      content: EMPTY_ANSWER,
      notice: true,
      ledgerId: 'r2',
    })
    expect(s.status).toEqual({ kind: 'idle' })
    // The notice is never sent back as something the model said.
    expect(outgoingMessages(s.messages).map((m) => m.content)).toEqual(['a', 'first', 'b'])
  })
  it('a failed turn with no text adds no notice and takes no ledger id', () => {
    let s = reduce(initialState, { type: 'user', content: 'a' })
    s = reduce(s, { type: 'event', event: { event: 'text', data: { delta: 'first' } } })
    s = reduce(s, { type: 'event', event: { event: 'done', data: { id: 'r1', outcome: 'ok' } } })
    s = reduce(s, { type: 'user', content: 'b' })
    s = reduce(s, {
      type: 'event',
      event: { event: 'error', data: { code: 'x', message: 'boom' } },
    })
    s = reduce(s, { type: 'event', event: { event: 'done', data: { id: 'r2', outcome: 'error' } } })
    expect(s.messages.at(-1)).toMatchObject({ role: 'user', content: 'b' })
    expect(s.messages.find((m) => m.ledgerId === 'r2')).toBeUndefined()
  })
  it('counts turns left out of twenty', () => {
    const s = reduce(initialState, { type: 'user', content: 'a' })
    expect(s.turnsLeft).toBe(19)
  })
  it('keeps an error event and resets to the initial state', () => {
    let s = reduce(initialState, { type: 'user', content: 'a' })
    s = reduce(s, {
      type: 'event',
      event: { event: 'error', data: { code: 'x', message: 'boom' } },
    })
    expect(s.status).toEqual({ kind: 'error', message: 'boom' })
    s = reduce(s, { type: 'event', event: { event: 'done', data: { id: 'r2', outcome: 'error' } } })
    expect(s.status.kind).toBe('error')
    expect(reduce(s, { type: 'reset' })).toEqual(initialState)
  })
  it('idle only clears an in-flight status', () => {
    const streaming = reduce(initialState, { type: 'user', content: 'a' })
    expect(reduce(streaming, { type: 'idle' }).status).toEqual({ kind: 'idle' })
    const budget = reduce(streaming, { type: 'http', status: 503, code: 'budget' })
    expect(reduce(budget, { type: 'idle' }).status).toEqual({ kind: 'budget' })
  })
  it('marks thumbs on the message with that id', () => {
    let s = reduce(initialState, { type: 'user', content: 'a' })
    s = reduce(s, { type: 'event', event: { event: 'text', data: { delta: 'hi' } } })
    const id = s.messages.at(-1)!.id
    s = reduce(s, { type: 'thumbs', messageId: id, thumbs: -1 })
    expect(s.messages.at(-1)?.thumbs).toBe(-1)
  })
})

describe('outgoingMessages', () => {
  it('trims, truncates to 2000, drops blanks, keeps 16 ending on the user turn', () => {
    const msgs = Array.from({ length: 30 }, (_, i) => ({
      role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
      content: i === 3 ? '   ' : `  ${'x'.repeat(2500)}  `,
    }))
    msgs.push({ role: 'user', content: '  last  ' })
    const out = outgoingMessages(msgs)
    expect(out).toHaveLength(16)
    expect(out.at(-1)).toEqual({ role: 'user', content: 'last' })
    expect(out.slice(0, -1).every((m) => m.content.length === 2000)).toBe(true)
    expect(
      outgoingMessages([
        { role: 'user', content: ' ' },
        { role: 'user', content: 'a' },
      ]),
    ).toEqual([{ role: 'user', content: 'a' }])
  })
})

describe('pagePath', () => {
  it.each([
    ['/seasons/2024', '/seasons/2024'],
    ['/', '/'],
    ['/drivers/p%C3%A9rez', '/'],
    ['/~user', '/'],
    ['/a+b', '/'],
    ['//evil', '/'],
    ['/' + 'a'.repeat(200), '/'],
  ])('%s → %s', (path, sent) => {
    expect(pagePath(path)).toBe(sent)
  })
})

describe('pageTitleFrom', () => {
  it.each([
    [null, null],
    [undefined, null],
    ['', null],
    ['   ', null],
    ['  2024 Season  ', '2024 Season'],
  ])('%j → %j', (text, title) => {
    expect(pageTitleFrom(text)).toBe(title)
  })
  it('caps the title at the server limit of 200', () => {
    expect(pageTitleFrom('x'.repeat(500))).toHaveLength(200)
    expect(pageTitleFrom(' '.repeat(10) + 'y'.repeat(195))).toHaveLength(195)
  })
})

describe('sendBlocked', () => {
  const idle = initialState
  const as = (status: EngineerState['status']): EngineerState => ({ ...idle, status })
  it('lets a question through only when idle (or after an error) with nothing in flight', () => {
    expect(sendBlocked(idle, 'q', false)).toBe(false)
    expect(sendBlocked(as({ kind: 'error', message: 'x' }), 'q', false)).toBe(false)
  })
  it('refuses a second send while the first is still in flight', () => {
    expect(sendBlocked(idle, 'q', true)).toBe(true)
  })
  it.each([
    { kind: 'streaming' },
    { kind: 'tool', label: 'search' },
    { kind: 'cooldown' },
    { kind: 'budget' },
  ] as EngineerState['status'][])('refuses while %j', (status) => {
    expect(sendBlocked(as(status), 'q', false)).toBe(true)
  })
  it('refuses an empty question and a spent conversation', () => {
    expect(sendBlocked(idle, '', false)).toBe(true)
    expect(sendBlocked({ ...idle, turnsLeft: 0 }, 'q', false)).toBe(true)
  })
})

describe('COOLDOWN_MS', () => {
  it("is the server's ten-minute rate window", () => {
    expect(COOLDOWN_MS).toBe(10 * 60 * 1000)
  })
})
