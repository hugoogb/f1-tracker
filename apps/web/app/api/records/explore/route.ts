import { NextResponse } from 'next/server'

import { api, ApiError } from '@/lib/api'
import { EXPLORE_CDN_MAX_AGE_SECONDS } from '@/lib/constants'
import type { RecordsExploreEntity, RecordsExploreCategory } from '@/lib/types'

export const runtime = 'nodejs'

function readParams(url: URL) {
  const get = (key: string) => url.searchParams.get(key) ?? undefined
  const asNumber = (key: string) => {
    const raw = get(key)
    if (raw === undefined) return undefined
    const value = Number(raw)
    return Number.isFinite(value) ? value : undefined
  }

  const entity = (get('entity') ?? 'driver') as RecordsExploreEntity
  return {
    entity,
    category: (get('category') ?? 'wins') as RecordsExploreCategory,
    era: get('era'),
    yearFrom: asNumber('year_from'),
    yearTo: asNumber('year_to'),
    nationality: entity === 'driver' ? get('nationality') : get('country'),
    minStarts: asNumber('min_starts'),
    sort: get('sort') as 'asc' | 'desc' | undefined,
    page: asNumber('page'),
    limit: asNumber('limit'),
  }
}

export async function GET(request: Request) {
  try {
    const data = await api.records.explore(readParams(new URL(request.url)))
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': `public, s-maxage=${EXPLORE_CDN_MAX_AGE_SECONDS}, stale-while-revalidate=86400`,
      },
    })
  } catch (err) {
    if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
      return NextResponse.json({ error: 'invalid filters' }, { status: err.status })
    }
    console.error('[records/explore] upstream fetch failed', err)
    return NextResponse.json({ error: 'records API unreachable' }, { status: 502 })
  }
}
