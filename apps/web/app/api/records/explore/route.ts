import { NextResponse } from 'next/server'

import { api, ApiError } from '@/lib/api'
import { OPS_REVALIDATE_SECONDS } from '@/lib/constants'
import type { RecordsExploreEntity, RecordsExploreCategory } from '@/lib/types'

/**
 * Same-origin front door for the records explorer.
 *
 * Every other page fetches FastAPI during the server render, so the browser
 * never learns the API's origin and CORS never enters into it. The explorer is
 * the one surface whose filters change without a navigation, so its request has
 * to happen client-side — and that alone would have made it the only endpoint
 * that can fail with a CORS rejection in production while every other page
 * keeps working, a failure no pre-deploy check catches.
 *
 * Proxying restores the rule: the browser calls its own origin, and the call to
 * FastAPI happens here, on the server, like everywhere else.
 */

export const runtime = 'nodejs'

/**
 * Forwarded parameters, transcribed rather than passed through.
 *
 * The upstream endpoint is a public read-only API, but a proxy that forwards
 * whatever it is handed is still a proxy for whatever it is handed. Reading
 * each parameter by name keeps this route a front door for one endpoint instead
 * of a general one, and hands FastAPI's own validation a shape it recognises.
 */
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
    // One control in the UI, two parameters upstream.
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
      // Matches the upstream fetch's own TTL. The explorer is a client fetch,
      // so this is what lets a repeated filter combination come back without a
      // round trip to the API at all.
      headers: {
        'Cache-Control': `public, s-maxage=${OPS_REVALIDATE_SECONDS}, stale-while-revalidate=300`,
      },
    })
  } catch (err) {
    // A rejected filter combination is the caller's (4xx) and must keep its
    // status, so the UI can say "not a combination we accept" rather than
    // "the API is down". Anything else is ours.
    if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
      return NextResponse.json({ error: 'invalid filters' }, { status: err.status })
    }
    console.error('[records/explore] upstream fetch failed', err)
    return NextResponse.json({ error: 'records API unreachable' }, { status: 502 })
  }
}
