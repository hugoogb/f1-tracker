import type { MetadataRoute } from 'next'
import { api } from '@/lib/api'
import type { Circuit, Constructor, Driver, PaginatedResponse, Race } from '@/lib/types'
import { absoluteUrl } from '@/lib/seo'

// The sitemap is rebuilt on the same cadence as the data behind it. Every fetch
// below also carries the `f1-data` tag, so an ingest purge refreshes it too.
export const revalidate = 86400

const PAGE_SIZE = 500
/** Keeps a sitemap rebuild from opening ~80 sockets against the API at once. */
const CONCURRENCY = 8

async function inBatches<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    out.push(...(await Promise.all(items.slice(i, i + CONCURRENCY).map(fn))))
  }
  return out
}

/** Walks a paginated endpoint to the end, giving up on the first failure. */
async function collect<T>(
  fetchPage: (page: number, pageSize: number) => Promise<unknown>,
): Promise<T[]> {
  const items: T[] = []
  for (let page = 1; ; page++) {
    const res = (await fetchPage(page, PAGE_SIZE)) as PaginatedResponse<T>
    items.push(...res.data)
    if (items.length >= res.total || res.data.length === 0) break
  }
  return items
}

const STATIC_ROUTES: {
  path: string
  priority: number
  changeFrequency: 'daily' | 'weekly' | 'monthly' | 'yearly'
}[] = [
  { path: '/', priority: 1, changeFrequency: 'daily' },
  { path: '/seasons', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/drivers', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/constructors', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/circuits', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/champions', priority: 0.7, changeFrequency: 'yearly' },
  { path: '/records', priority: 0.7, changeFrequency: 'weekly' },
  { path: '/compare', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/attributions', priority: 0.3, changeFrequency: 'yearly' },
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  const entries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: absoluteUrl(route.path),
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }))

  // Each section degrades on its own: an endpoint that is down costs its own
  // URLs, not the whole sitemap.
  const [seasons, drivers, constructors, circuits] = await Promise.allSettled([
    api.seasons.list(),
    collect<Driver>((page, pageSize) => api.drivers.list(page, pageSize)),
    collect<Constructor>((page, pageSize) => api.constructors.list(page, pageSize)),
    collect<Circuit>((page, pageSize) => api.circuits.list(page, pageSize)),
  ])

  const years = seasons.status === 'fulfilled' ? seasons.value.data.map((s) => s.year) : []

  for (const year of years) {
    entries.push({
      url: absoluteUrl(`/seasons/${year}`),
      changeFrequency: 'weekly',
      priority: 0.8,
    })
  }

  if (drivers.status === 'fulfilled') {
    for (const driver of drivers.value) {
      entries.push({
        url: absoluteUrl(`/drivers/${driver.ref}`),
        changeFrequency: 'weekly',
        priority: 0.7,
      })
    }
  }

  if (constructors.status === 'fulfilled') {
    for (const constructor of constructors.value) {
      entries.push({
        url: absoluteUrl(`/constructors/${constructor.ref}`),
        changeFrequency: 'weekly',
        priority: 0.7,
      })
    }
  }

  if (circuits.status === 'fulfilled') {
    for (const circuit of circuits.value) {
      entries.push({
        url: absoluteUrl(`/circuits/${circuit.ref}`),
        changeFrequency: 'monthly',
        priority: 0.6,
      })
    }
  }

  // Race pages are the long tail — one round per season detail response.
  const raceLists = await inBatches(years, async (year) => {
    try {
      const season = (await api.seasons.get(year)) as { races: Race[] }
      return season.races ?? []
    } catch {
      return []
    }
  })

  for (const race of raceLists.flat()) {
    entries.push({
      url: absoluteUrl(`/seasons/${race.seasonYear}/races/${race.round}`),
      lastModified: race.date ? new Date(race.date) : undefined,
      changeFrequency: 'monthly',
      priority: 0.6,
    })
  }

  return entries
}
