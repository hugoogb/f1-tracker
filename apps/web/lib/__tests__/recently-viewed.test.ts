import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readRecent, recordVisit, type RecentItem } from '@/lib/recently-viewed'

function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  }
}

const item = (n: number): RecentItem => ({
  href: `/drivers/d${n}`,
  label: `Driver ${n}`,
  kind: 'driver',
})

describe('recently viewed', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps the six newest, newest first', () => {
    for (let n = 1; n <= 7; n++) recordVisit(item(n))
    const recent = readRecent()
    expect(recent).toHaveLength(6)
    expect(recent[0].href).toBe('/drivers/d7')
    expect(recent.at(-1)?.href).toBe('/drivers/d2')
  })

  it('moves a revisited page to the front without duplicating it', () => {
    recordVisit(item(1))
    recordVisit(item(2))
    recordVisit(item(1))
    expect(readRecent().map((r) => r.href)).toEqual(['/drivers/d1', '/drivers/d2'])
  })

  it('reads corrupt or foreign data as empty', () => {
    localStorage.setItem('f1-recently-viewed', '{oops')
    expect(readRecent()).toEqual([])
    localStorage.setItem('f1-recently-viewed', '{"a":1}')
    expect(readRecent()).toEqual([])
    localStorage.setItem('f1-recently-viewed', '[{"nope":true}, 3]')
    expect(readRecent()).toEqual([])
  })

  it('survives storage that throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    expect(readRecent()).toEqual([])
    expect(() => recordVisit(item(1))).not.toThrow()
  })

  it('survives no storage at all (server render)', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(readRecent()).toEqual([])
    expect(() => recordVisit(item(1))).not.toThrow()
  })
})
