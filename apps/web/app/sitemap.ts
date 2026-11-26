import type { MetadataRoute } from 'next'
import { api } from '@/lib/api'
import { collectAllPages } from '@/lib/paged-fetch'
import type { Circuit, Constructor, Driver } from '@/lib/types'
import { absoluteUrl, raceSitemapEntry, type SeasonRace } from '@/lib/seo'
import {
  CURATED_CONSTRUCTOR_PAIRS,
  CURATED_DRIVER_PAIRS,
  pairHref,
} from '@/lib/curated-comparisons'
import { NATIONALITY_PAGES, RECORD_RANKINGS, nationalityHref, rankingHref } from '@/lib/seo-landing'

export const revalidate = 86400

const CONCURRENCY = 8

async function inBatches<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    out.push(...(await Promise.all(items.slice(i, i + CONCURRENCY).map(fn))))
  }
  return out
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
  { path: '/best-seasons', priority: 0.7, changeFrequency: 'weekly' },
  { path: '/compare', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/attributions', priority: 0.3, changeFrequency: 'yearly' },
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: absoluteUrl(route.path),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }))

  for (const [kind, pairs] of [
    ['drivers', CURATED_DRIVER_PAIRS],
    ['constructors', CURATED_CONSTRUCTOR_PAIRS],
  ] as const) {
    for (const pair of pairs) {
      entries.push({
        url: absoluteUrl(pairHref(kind, pair)),
        changeFrequency: 'weekly',
        priority: 0.7,
      })
    }
  }
  for (const ranking of RECORD_RANKINGS) {
    entries.push({
      url: absoluteUrl(rankingHref(ranking)),
      changeFrequency: 'weekly',
      priority: 0.7,
    })
  }
  for (const nationality of NATIONALITY_PAGES) {
    entries.push({
      url: absoluteUrl(nationalityHref(nationality)),
      changeFrequency: 'weekly',
      priority: 0.6,
    })
  }

  const [seasons, drivers, constructors, circuits] = await Promise.allSettled([
    api.seasons.list(),
    collectAllPages<Driver>((page, pageSize) => api.drivers.list(page, pageSize)),
    collectAllPages<Constructor>((page, pageSize) => api.constructors.list(page, pageSize)),
    collectAllPages<Circuit>((page, pageSize) => api.circuits.list(page, pageSize)),
  ])

  const sections = { seasons, drivers, constructors, circuits }
  for (const [name, section] of Object.entries(sections)) {
    if (section.status === 'rejected') {
      console.error(`sitemap: dropped the ${name} section`, section.reason)
    }
  }

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

  const seasonRaces = await inBatches(years, async (year) => {
    try {
      const season = (await api.seasons.get(year)) as { races: SeasonRace[] }
      return { year, races: season.races ?? [] }
    } catch {
      return { year, races: [] }
    }
  })

  const now = Date.now()
  for (const { year, races } of seasonRaces) {
    for (const race of races) entries.push(raceSitemapEntry(year, race, now))
  }

  return entries
}
