import { revalidateTag } from 'next/cache'
import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { API_BASE_URL, F1_DATA_TAG, F1_GLOBAL_TAG, entityTag, seasonTag } from '@/lib/constants'
import type { SeasonCalendarResponse, SeasonCompareEntrants } from '@/lib/types'

export const runtime = 'nodejs'

/** f1db starts in 1950; anything outside this is a typo, not a season. */
const MIN_YEAR = 1950
const MAX_YEAR = 2100
const MAX_YEARS = 20

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/**
 * What the caller asked to expire.
 *
 * - no body, an empty body, or `{"scope":"all"}`: everything (the `f1-data`
 *   tag). This is what every caller sent before scoped purges existed, so an
 *   old caller still gets the purge it always got.
 * - `{"scope":"latest"}`: the newest season the API knows, as below.
 * - `{"years":[2025,2026]}`: those seasons, the drivers, constructors and
 *   circuits that took part in them, and the global lists.
 */
type PurgeRequest = { kind: 'all' } | { kind: 'latest' } | { kind: 'years'; years: number[] }

async function readRequest(request: Request): Promise<PurgeRequest | null> {
  const text = (await request.text()).trim()
  if (!text) return { kind: 'all' }
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return null
  }
  if (!body || typeof body !== 'object') return null
  const { scope, years } = body as { scope?: unknown; years?: unknown }
  if (years !== undefined) {
    if (!Array.isArray(years) || years.length === 0 || years.length > MAX_YEARS) return null
    const valid = years.every(
      (y) => Number.isInteger(y) && (y as number) >= MIN_YEAR && (y as number) <= MAX_YEAR,
    )
    return valid ? { kind: 'years', years: [...new Set(years as number[])] } : null
  }
  if (scope === undefined || scope === 'all') return { kind: 'all' }
  if (scope === 'latest') return { kind: 'latest' }
  return null
}

/**
 * Straight from FastAPI, never from the Data Cache: this runs right after an
 * import, and the cached copies are exactly what is about to be expired.
 */
async function fetchFresh<T>(endpoint: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${endpoint}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`${endpoint}: HTTP ${res.status}`)
  return res.json() as Promise<T>
}

/**
 * The tags an import touching `years` can have changed: each season, every
 * entity that appears in it (a driver page shows career totals, so a race in
 * 2026 changes Hamilton's profile but not Fangio's), and the global lists.
 * Must name the same tags `cacheScopeFor` in `lib/api.ts` hands out.
 */
async function tagsForYears(years: number[]): Promise<string[]> {
  const tags = new Set<string>([F1_GLOBAL_TAG])
  for (const year of years) {
    tags.add(seasonTag(year))
    const [entrants, calendar] = await Promise.all([
      fetchFresh<SeasonCompareEntrants>(`/seasons/${year}/compare/entrants`),
      fetchFresh<SeasonCalendarResponse>(`/seasons/${year}/calendar`),
    ])
    for (const d of entrants.drivers) tags.add(entityTag('driver', d.ref))
    for (const c of entrants.constructors) tags.add(entityTag('constructor', c.ref))
    for (const r of calendar.rounds) {
      if (r.circuit?.ref) tags.add(entityTag('circuit', r.circuit.ref))
    }
  }
  return [...tags]
}

export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET
  const auth = request.headers.get('authorization')
  const provided = auth && auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''

  if (!secret || !provided || !safeEqual(provided, secret)) {
    return NextResponse.json({ revalidated: false }, { status: 401 })
  }

  const purge = await readRequest(request)
  if (!purge) {
    return NextResponse.json(
      {
        revalidated: false,
        error: 'expected no body, {"scope":"all"|"latest"} or {"years":[<year>, ...]}',
      },
      { status: 400 },
    )
  }

  // A scoped purge needs the API to say what the season contains. If it cannot,
  // expire everything instead: over-purging costs some re-renders, while
  // under-purging leaves pages showing data from before the import.
  let tags = [F1_DATA_TAG]
  let scope = 'all'
  if (purge.kind !== 'all') {
    try {
      const years =
        purge.kind === 'years'
          ? purge.years
          : [(await fetchFresh<{ data: { year: number }[] }>('/seasons')).data[0].year]
      tags = await tagsForYears(years)
      scope = `years:${years.join(',')}`
    } catch (err) {
      console.error('[revalidate] scoped purge lookup failed; purging everything', err)
    }
  }

  try {
    // `{ expire: 0 }`, not 'max': this is called after new data has landed, and
    // 'max' is stale-while-revalidate — the next visitor would still be served
    // the old page while a background render ran, so a race page cached before
    // `pnpm fastf1` kept saying it had no lap times. Expiring makes that next
    // request render fresh, which is what an ingest webhook is for.
    for (const tag of tags) revalidateTag(tag, { expire: 0 })
  } catch (err) {
    console.error('[revalidate] revalidateTag failed', err)
    return NextResponse.json(
      { revalidated: false, error: 'tag revalidation failed' },
      { status: 500 },
    )
  }
  return NextResponse.json({ revalidated: true, scope, tags: tags.length, tag: tags[0] })
}
