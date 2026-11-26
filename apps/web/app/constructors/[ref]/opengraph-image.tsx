import { ImageResponse } from 'next/og'
import { api } from '@/lib/api'
import type { Constructor } from '@/lib/types'
import { SITE_NAME } from '@/lib/seo'
import { formatPoints, teamColorOf } from '@/lib/utils'
import { OgCard, OgFallbackCard } from '@/components/seo/og-card'

export const alt = `Constructor record card — ${SITE_NAME}`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

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

export default async function Image({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params

  let entry: ConstructorDetail
  try {
    entry = (await api.constructors.get(ref)) as ConstructorDetail
  } catch {
    return new ImageResponse(
      <OgFallbackCard eyebrow="Constructor" title="Formula 1 constructors" />,
      size,
    )
  }

  const { total_entries: entries, wins, podiums, total_points: points } = entry.stats

  return new ImageResponse(
    <OgCard
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
