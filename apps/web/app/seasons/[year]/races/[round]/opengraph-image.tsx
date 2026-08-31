import { ImageResponse } from 'next/og'
import { api } from '@/lib/api'
import { OgCard, OgFallback, OG_CONTENT_TYPE, OG_SIZE } from '@/lib/og'
import type { Race, RaceResult } from '@/lib/types'

export const alt = 'Race result on F1 Tracker'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

interface RaceDetail extends Race {
  results: RaceResult[]
}

export default async function Image({
  params,
}: {
  params: Promise<{ year: string; round: string }>
}) {
  const { year, round } = await params

  try {
    const race = (await api.races.get(parseInt(year, 10), parseInt(round, 10))) as RaceDetail
    const podium = race.results
      .filter((r) => r.position && r.position <= 3)
      .sort((a, b) => (a.position ?? 99) - (b.position ?? 99))

    return new ImageResponse(
      <OgCard
        eyebrow={`${year} · Round ${round}`}
        title={race.name}
        subtitle={race.circuit.name}
        accent={podium[0]?.constructor.color}
        stats={podium.map((entry, index) => ({
          label: ['Winner', 'Second', 'Third'][index],
          value: entry.driver.lastName,
        }))}
      />,
      size,
    )
  } catch {
    return new ImageResponse(<OgFallback />, size)
  }
}
