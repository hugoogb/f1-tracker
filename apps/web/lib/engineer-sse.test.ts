import { describe, expect, it } from 'vitest'
import { createSseParser } from './engineer-sse'

describe('createSseParser', () => {
  it('reassembles events split across chunks', () => {
    const seen: [string, unknown][] = []
    const p = createSseParser((e, d) => seen.push([e, d]))
    p.push('event: text\ndata: {"del')
    p.push('ta":"Max"}\n\nevent: do')
    p.push('ne\ndata: {"id":"r1","outcome":"ok"}\n\n')
    p.end()
    expect(seen).toEqual([
      ['text', { delta: 'Max' }],
      ['done', { id: 'r1', outcome: 'ok' }],
    ])
  })
  it('ignores comments and dispatches a trailing event on end()', () => {
    const seen: string[] = []
    const p = createSseParser((e) => seen.push(e))
    p.push(': keepalive\n\nevent: usage\ndata: {"toolCalls":1,"costUsd":0.0003}')
    p.end()
    expect(seen).toEqual(['usage'])
  })
  it('ignores an event with no data line', () => {
    const seen: string[] = []
    const p = createSseParser((e) => seen.push(e))
    p.push('event: text\n\nevent: done\ndata: {"id":"a","outcome":"ok"}\n\n')
    p.end()
    expect(seen).toEqual(['done'])
  })
  it('handles CRLF line endings', () => {
    const seen: [string, unknown][] = []
    const p = createSseParser((e, d) => seen.push([e, d]))
    p.push('event: text\r\ndata: {"delta":"a"}\r\n\r\n')
    expect(seen).toEqual([['text', { delta: 'a' }]])
  })
})
