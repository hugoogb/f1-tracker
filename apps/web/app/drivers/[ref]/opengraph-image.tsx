import { ImageResponse } from 'next/og'
import { api } from '@/lib/api'
import { OgCard, OgFallback, OG_CONTENT_TYPE, OG_SIZE } from '@/lib/og'
import type { Driver } from '@/lib/types'

export const alt = 'Driver profile on F1 Tracker'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

interface DriverDetail extends Driver {
  stats: {
    total_races: number
    wins: number
    podiums: number
    poles: number
    championships: number
  }
}

export default async function Image({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params

  try {
    const driver = (await api.drivers.get(ref)) as DriverDetail
    return new ImageResponse(
      <OgCard
        eyebrow={driver.nationality ?? 'Driver'}
        title={`${driver.firstName} ${driver.lastName}`}
        subtitle={`${driver.stats.total_races} Grand Prix starts`}
        stats={[
          { label: 'Wins', value: driver.stats.wins },
          { label: 'Podiums', value: driver.stats.podiums },
          { label: 'Poles', value: driver.stats.poles },
          { label: 'Titles', value: driver.stats.championships },
        ]}
      />,
      size,
    )
  } catch {
    // A share card must never be the reason a page fails to render.
    return new ImageResponse(<OgFallback />, size)
  }
}
