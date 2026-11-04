import type { PaginatedResponse } from '@/lib/types'

/**
 * Mirrors `MAX_PAGE_SIZE` in `pipeline/src/api/constants.py`; change both or
 * neither. The API answers 422 above it, and the sitemap treats a failed section
 * as empty, so a larger value here silently unlists every page in that section.
 */
export const MAX_API_PAGE_SIZE = 200

/** Walks a paginated endpoint to the end, giving up on the first failure. */
export async function collectAllPages<T>(
  fetchPage: (page: number, pageSize: number) => Promise<unknown>,
): Promise<T[]> {
  const items: T[] = []
  for (let page = 1; ; page++) {
    const res = (await fetchPage(page, MAX_API_PAGE_SIZE)) as PaginatedResponse<T>
    items.push(...res.data)
    if (items.length >= res.total || res.data.length === 0) break
  }
  return items
}
