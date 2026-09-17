import { ImageResponse } from 'next/og'
import { api } from '@/lib/api'
import type { Driver } from '@/lib/types'
import { SITE_NAME } from '@/lib/seo'
import { OgCard, OgFallbackCard } from '@/components/seo/og-card'

export const alt = `Driver career card — ${SITE_NAME}`
// Next reads these by static analysis at build time, so they have to be
// literals here rather than constants imported from the shared card.
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/**
 * Same deal as the page in this segment: nothing is prerendered at build time,
 * but an empty list still opts the route into the full route cache, so a card
 * is rendered once on first request and then served from the cache until an
 * ingest purges the `f1-data` tag that `fetchApi` puts on every request. A
 * metadata image route does not inherit the page's, so it needs its own.
 */
export function generateStaticParams() {
  return []
}

interface DriverDetail extends Driver {
  stats: {
    total_races: number
    wins: number
    podiums: number
    poles: number
    fastest_laps: number
    championships: number
    total_points: number
  }
}

export default async function Image({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params

  let driver: DriverDetail
  try {
    driver = (await api.drivers.get(ref)) as DriverDetail
  } catch {
    // Never 404 and never throw: a metadata image that errors shows a social
    // scraper a broken card, and the page already decides missing-vs-outage.
    return new ImageResponse(<OgFallbackCard eyebrow="Driver" title="Formula 1 drivers" />, size)
  }

  const { wins, poles, podiums, championships, total_races: races } = driver.stats

  return new ImageResponse(
    <OgCard
      eyebrow="Driver"
      title={`${driver.firstName} ${driver.lastName}`}
      subtitle={driver.nationality}
      meta={driver.number != null ? `Car number ${driver.number}` : null}
      stats={[
        ...(championships > 0 ? [{ label: 'Titles', value: championships }] : []),
        { label: 'Starts', value: races },
        { label: 'Wins', value: wins },
        { label: 'Poles', value: poles },
        { label: 'Podiums', value: podiums },
      ]}
    />,
    size,
  )
}
