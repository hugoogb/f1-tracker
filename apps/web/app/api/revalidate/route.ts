import { revalidateTag } from 'next/cache'
import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { API_BASE_URL, F1_DATA_TAG, F1_GLOBAL_TAG, entityTag, seasonTag } from '@/lib/constants'
import type { SeasonCalendarResponse, SeasonCompareEntrants } from '@/lib/types'

export const runtime = 'nodejs'

const MIN_YEAR = 1950
const MAX_YEAR = 2100
const MAX_YEARS = 20

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

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

async function fetchFresh<T>(endpoint: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${endpoint}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`${endpoint}: HTTP ${res.status}`)
  return res.json() as Promise<T>
}

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
