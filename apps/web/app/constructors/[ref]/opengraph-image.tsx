import { ImageResponse } from 'next/og'
import { api } from '@/lib/api'
import { OgCard, OgFallback, OG_CONTENT_TYPE, OG_SIZE } from '@/lib/og'
import type { Constructor } from '@/lib/types'

export const alt = 'Constructor profile on F1 Tracker'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

interface ConstructorDetail extends Constructor {
  stats: {
    total_entries: number
    wins: number
    podiums: number
    total_points: number
  }
}

export default async function Image({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params

  try {
    const constructor = (await api.constructors.get(ref)) as ConstructorDetail
    return new ImageResponse(
      <OgCard
        eyebrow={constructor.nationality ?? 'Constructor'}
        title={constructor.name}
        subtitle={`${constructor.stats.total_entries} race entries`}
        accent={constructor.color}
        stats={[
          { label: 'Wins', value: constructor.stats.wins },
          { label: 'Podiums', value: constructor.stats.podiums },
          { label: 'Points', value: Math.round(constructor.stats.total_points) },
        ]}
      />,
      size,
    )
  } catch {
    return new ImageResponse(<OgFallback />, size)
  }
}
