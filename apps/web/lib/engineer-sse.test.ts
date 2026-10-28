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
  it('drops an event whose data is not JSON and carries on', () => {
    const seen: [string, unknown][] = []
    const p = createSseParser((e, d) => seen.push([e, d]))
    p.push('event: text\ndata: {not json\n\nevent: text\ndata: {"delta":"ok"}\n\n')
    expect(seen).toEqual([['text', { delta: 'ok' }]])
  })
  it('joins several data lines with a newline', () => {
    const seen: unknown[] = []
    const p = createSseParser((_, d) => seen.push(d))
    p.push('event: text\ndata: {"delta":\ndata: "a"}\n\n')
    expect(seen).toEqual([{ delta: 'a' }])
    const raw: unknown[] = []
    const q = createSseParser((_, d) => raw.push(d))
    q.push('data: [1,\ndata: 2]\n\n')
    expect(raw).toEqual([[1, 2]])
  })
  it('accepts a field with no space after the colon', () => {
    const seen: [string, unknown][] = []
    const p = createSseParser((e, d) => seen.push([e, d]))
    p.push('event:text\ndata:{"delta":"a"}\n\n')
    expect(seen).toEqual([['text', { delta: 'a' }]])
  })
  it('handles a CRLF pair split across two chunks', () => {
    const seen: [string, unknown][] = []
    const p = createSseParser((e, d) => seen.push([e, d]))
    p.push('event: text\r')
    p.push('\ndata: {"delta":"a"}\r\n\r')
    p.push('\n')
    expect(seen).toEqual([['text', { delta: 'a' }]])
  })
  it('treats a bare CR as a line break', () => {
    const seen: [string, unknown][] = []
    const p = createSseParser((e, d) => seen.push([e, d]))
    p.push('event: text\rdata: {"delta":"a"}\r\revent: done\rdata: {"id":"r"}\r')
    expect(seen).toEqual([['text', { delta: 'a' }]])
    // A trailing CR could still be half of a CRLF, so it resolves on the next byte.
    p.push('\r')
    expect(seen).toEqual([['text', { delta: 'a' }]])
    p.push(': ping\r')
    expect(seen).toEqual([
      ['text', { delta: 'a' }],
      ['done', { id: 'r' }],
    ])
  })
  it('dispatches on end() when the stream stops after a bare CR', () => {
    const seen: string[] = []
    const p = createSseParser((e) => seen.push(e))
    p.push('event: done\rdata: {"id":"r"}\r')
    p.end()
    expect(seen).toEqual(['done'])
  })
})
