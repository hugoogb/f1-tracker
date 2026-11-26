import type { PaginatedResponse } from '@/lib/types'

export const MAX_API_PAGE_SIZE = 200

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
