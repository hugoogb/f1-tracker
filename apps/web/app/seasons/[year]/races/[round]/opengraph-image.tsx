import { ImageResponse } from 'next/og'
import { api } from '@/lib/api'
import type { Race, RaceResult } from '@/lib/types'
import { SITE_NAME } from '@/lib/seo'
import { teamColorOf } from '@/lib/utils'
import { OgCard, OgFallbackCard } from '@/components/seo/og-card'

export const alt = `Grand Prix result card — ${SITE_NAME}`
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

interface RaceDetailResponse extends Race {
  results: RaceResult[]
}

const PODIUM_LABELS = ['1st', '2nd', '3rd']

export default async function Image({
  params,
}: {
  params: Promise<{ year: string; round: string }>
}) {
  const { year, round } = await params
  const yearNum = parseInt(year, 10)
  const roundNum = parseInt(round, 10)

  const fallback = () =>
    new ImageResponse(<OgFallbackCard eyebrow="Grand Prix" title="Formula 1 race results" />, size)

  if (isNaN(yearNum) || isNaN(roundNum)) return fallback()

  let race: RaceDetailResponse
  try {
    race = (await api.races.get(yearNum, roundNum)) as RaceDetailResponse
  } catch {
    // Never 404 and never throw — see the driver card.
    return fallback()
  }

  const podium = (race.results ?? [])
    .filter((result) => result.position !== null && result.position <= 3)
    .sort((a, b) => (a.position ?? 99) - (b.position ?? 99))
    .slice(0, 3)

  return new ImageResponse(
    <OgCard
      eyebrow={`${yearNum} · Round ${roundNum}`}
      title={race.name}
      subtitle={race.circuit?.name ?? null}
      meta={
        podium.length > 0
          ? `Won by ${podium[0].driver.firstName} ${podium[0].driver.lastName}`
          : 'Results, qualifying and lap-by-lap analysis'
      }
      accent={podium.length > 0 ? teamColorOf(podium[0].constructor.color, null) : null}
      stats={podium.map((result, index) => ({
        label: PODIUM_LABELS[index],
        value: result.driver.lastName,
      }))}
    />,
    size,
  )
}
