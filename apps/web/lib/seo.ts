import type { Metadata } from 'next'

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://f1-tracker.hugoogb.dev'
).replace(/\/$/, '')

export const SITE_NAME = 'F1 Tracker'

export const SITE_DESCRIPTION =
  'Explore the complete history of Formula 1 — every season, driver, constructor and circuit since 1950, with interactive analytics, standings, race results and head-to-head comparisons.'

export const THEME_COLOR = '#E10600'

export const absoluteUrl = (path = '/') => `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`

const OG_IMAGE = {
  url: absoluteUrl('/opengraph-image'),
  width: 1200,
  height: 630,
  alt: `${SITE_NAME} — Formula 1 history, stats and analytics`,
}

interface SeoInput {
  title: string
  description: string
  path: string
  noindex?: boolean
  type?: 'website' | 'article' | 'profile'
  image?: string
  imageAlt?: string
}

export function buildMetadata({
  title,
  description,
  path,
  noindex = false,
  type = 'website',
  image,
  imageAlt,
}: SeoInput): Metadata {
  const url = absoluteUrl(path)
  const ogImage = image
    ? {
        url: absoluteUrl(image),
        width: OG_IMAGE.width,
        height: OG_IMAGE.height,
        alt: imageAlt ?? `${title} — ${SITE_NAME}`,
      }
    : OG_IMAGE
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: `${title} | ${SITE_NAME}`,
      description,
      url,
      siteName: SITE_NAME,
      type,
      locale: 'en_US',
      images: [ogImage],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | ${SITE_NAME}`,
      description,
      images: [ogImage.url],
    },
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
  }
}

export function buildListMetadata(
  input: SeoInput,
  { page, filter }: { page?: string; filter?: string },
): Metadata {
  const n = Number(page)
  if (filter || !Number.isInteger(n) || n <= 1) return buildMetadata(input)
  return buildMetadata({
    ...input,
    title: `${input.title}, page ${n}`,
    path: `${input.path}?page=${n}`,
  })
}

export function pageHref(pathname: string, search: string, page: number): string {
  const params = new URLSearchParams(search)
  if (page <= 1) params.delete('page')
  else params.set('page', String(page))
  const qs = params.toString()
  return qs ? `${pathname}?${qs}` : pathname
}

export interface SeasonRace {
  round: number
  date: string | null
}

export function raceSitemapEntry(year: number, race: SeasonRace, now: number) {
  const raced = race.date ? new Date(race.date) : null
  return {
    url: absoluteUrl(`/seasons/${year}/races/${race.round}`),
    lastModified: raced && raced.getTime() <= now ? raced : undefined,
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }
}
