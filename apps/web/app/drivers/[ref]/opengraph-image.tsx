import { ImageResponse } from 'next/og'
import { api } from '@/lib/api'
import type { Driver } from '@/lib/types'
import { SITE_NAME } from '@/lib/seo'
import { OgCard, OgFallbackCard } from '@/components/seo/og-card'

export const alt = `Driver career card — ${SITE_NAME}`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

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
