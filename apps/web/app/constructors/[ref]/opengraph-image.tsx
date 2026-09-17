import { ImageResponse } from 'next/og'
import { api } from '@/lib/api'
import type { Constructor } from '@/lib/types'
import { SITE_NAME } from '@/lib/seo'
import { teamColorOf } from '@/lib/utils'
import { OgCard, OgFallbackCard } from '@/components/seo/og-card'

export const alt = `Constructor record card — ${SITE_NAME}`
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

interface ConstructorDetail extends Constructor {
  stats: {
    total_entries: number
    wins: number
    podiums: number
    total_points: number
  }
}

/** Points are a float in the payload but a whole number for all but a few teams. */
const formatPoints = (points: number) =>
  Number.isInteger(points) ? String(points) : points.toFixed(1)

export default async function Image({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params

  let entry: ConstructorDetail
  try {
    entry = (await api.constructors.get(ref)) as ConstructorDetail
  } catch {
    // Never 404 and never throw — see the driver card.
    return new ImageResponse(
      // Plural on purpose: Satori renders the bare lowercase singular as blank
      // space. `satoriText()` inside the card handles dynamic copy; fixed copy
      // just avoids the word.
      <OgFallbackCard eyebrow="Constructor" title="Formula 1 constructors" />,
      size,
    )
  }

  const { total_entries: entries, wins, podiums, total_points: points } = entry.stats

  return new ImageResponse(
    <OgCard
      // Uppercased by the card, which is a different Satori cache key from the
      // poisoned lowercase one, so the word survives.
      eyebrow="Constructor"
      title={entry.name}
      subtitle={entry.nationality}
      accent={teamColorOf(entry.color, null)}
      stats={[
        { label: 'Entries', value: entries },
        { label: 'Wins', value: wins },
        { label: 'Podiums', value: podiums },
        { label: 'Points', value: formatPoints(points) },
      ]}
    />,
    size,
  )
}
