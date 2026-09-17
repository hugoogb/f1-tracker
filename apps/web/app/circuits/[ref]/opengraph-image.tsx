import { ImageResponse } from 'next/og'
import { api } from '@/lib/api'
import type { Circuit } from '@/lib/types'
import { SITE_NAME } from '@/lib/seo'
import { OgCard, OgFallbackCard } from '@/components/seo/og-card'

export const alt = `Circuit card — ${SITE_NAME}`
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

interface CircuitDetail extends Circuit {
  races: { seasonYear: number }[]
}

export default async function Image({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params

  let circuit: CircuitDetail
  try {
    circuit = (await api.circuits.get(ref)) as CircuitDetail
  } catch {
    // Never 404 and never throw — see the driver card.
    return new ImageResponse(<OgFallbackCard eyebrow="Circuit" title="Formula 1 circuits" />, size)
  }

  const years = (circuit.races ?? []).map((race) => race.seasonYear)
  const first = years.length > 0 ? Math.min(...years) : null
  const last = years.length > 0 ? Math.max(...years) : null

  return new ImageResponse(
    <OgCard
      eyebrow="Circuit"
      title={circuit.name}
      subtitle={[circuit.location, circuit.country].filter(Boolean).join(', ') || null}
      meta={
        first === null
          ? 'No Grand Prix held here yet'
          : first === last
            ? `Hosted a Grand Prix in ${first}`
            : `Host of Grands Prix from ${first} to ${last}`
      }
      stats={[
        { label: 'Grands Prix', value: years.length },
        ...(first === null ? [] : [{ label: 'First', value: first }]),
        ...(last === null || last === first ? [] : [{ label: 'Latest', value: last }]),
      ]}
    />,
    size,
  )
}
