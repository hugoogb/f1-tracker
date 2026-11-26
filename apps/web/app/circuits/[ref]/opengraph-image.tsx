import { ImageResponse } from 'next/og'
import { api } from '@/lib/api'
import type { Circuit } from '@/lib/types'
import { SITE_NAME } from '@/lib/seo'
import { OgCard, OgFallbackCard } from '@/components/seo/og-card'

export const alt = `Circuit card — ${SITE_NAME}`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

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
