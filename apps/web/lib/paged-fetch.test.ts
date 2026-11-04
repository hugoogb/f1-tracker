import { describe, expect, it } from 'vitest'
import { collectAllPages, MAX_API_PAGE_SIZE } from './paged-fetch'

/** Behaves like the FastAPI list endpoints, including their `le=200` validation. */
function fakeEndpoint(total: number) {
  const all = Array.from({ length: total }, (_, i) => i)
  return async (page: number, pageSize: number) => {
    if (pageSize > 200) throw new Error('422: page_size must be <= 200')
    const start = (page - 1) * pageSize
    return { data: all.slice(start, start + pageSize), total, page, pageSize }
  }
}

describe('collectAllPages', () => {
  it('stays within the page size the API accepts', () => {
    expect(MAX_API_PAGE_SIZE).toBeLessThanOrEqual(200)
  })

  it('walks every page of a list longer than one page', async () => {
    const items = await collectAllPages<number>(fakeEndpoint(920))
    expect(items).toHaveLength(920)
    expect(new Set(items).size).toBe(920)
  })

  it('stops on an empty list', async () => {
    await expect(collectAllPages<number>(fakeEndpoint(0))).resolves.toEqual([])
  })

  it('propagates a failure so the caller can report the section', async () => {
    const failing = async () => {
      throw new Error('boom')
    }
    await expect(collectAllPages(failing)).rejects.toThrow('boom')
  })
})
