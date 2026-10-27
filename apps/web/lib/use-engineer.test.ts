import { describe, expect, it } from 'vitest'
import { initialState, reduce } from './use-engineer'

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
  it('maps 503 and 429 to budget and cooldown, other statuses to error', () => {
    expect(reduce(initialState, { type: 'http', status: 503 }).status).toEqual({ kind: 'budget' })
    expect(reduce(initialState, { type: 'http', status: 429 }).status).toEqual({ kind: 'cooldown' })
    expect(reduce(initialState, { type: 'http', status: 500 }).status.kind).toBe('error')
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
    const budget = reduce(streaming, { type: 'http', status: 503 })
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
