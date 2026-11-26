import { ImageResponse } from 'next/og'
import { api } from '@/lib/api'
import type { DriverStanding, Race } from '@/lib/types'
import { SITE_NAME } from '@/lib/seo'
import { teamColorOf } from '@/lib/utils'
import { OgCard, OgFallbackCard } from '@/components/seo/og-card'

export const alt = `Formula 1 season card — ${SITE_NAME}`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export function generateStaticParams() {
  return []
}

interface SeasonDetailResponse {
  year: number
  races: Race[]
}

function seasonIsOver(races: Race[]): boolean {
  const dates = races.map((race) => race.date).filter(Boolean)
  if (dates.length === 0) return false
  const last = dates.reduce((a, b) => (a > b ? a : b))
  return last < new Date().toISOString().slice(0, 10)
}

export default async function Image({ params }: { params: Promise<{ year: string }> }) {
  const { year } = await params
  const yearNum = parseInt(year, 10)

  const fallback = () =>
    new ImageResponse(<OgFallbackCard eyebrow="Season" title="Formula 1 seasons" />, size)

  if (isNaN(yearNum)) return fallback()

  const [seasonResult, standingsResult] = await Promise.allSettled([
    api.seasons.get(yearNum) as Promise<SeasonDetailResponse>,
    api.seasons.driverStandings(yearNum) as Promise<{ standings: DriverStanding[] }>,
  ])

  if (seasonResult.status === 'rejected') return fallback()

  const races = seasonResult.value.races ?? []
  const leader =
    standingsResult.status === 'fulfilled'
      ? standingsResult.value.standings.find((row) => row.position === 1)
      : undefined

  const decided = seasonIsOver(races)
  const title = leader
    ? `${leader.driver.firstName} ${leader.driver.lastName}`
    : `${yearNum} Season`

  return new ImageResponse(
    <OgCard
      eyebrow={`${yearNum} Season`}
      title={title}
      subtitle={leader ? (decided ? 'World Champion' : 'Championship leader') : null}
      meta={leader?.constructor?.name ?? null}
      accent={leader?.constructor ? teamColorOf(leader.constructor.color, null) : null}
      stats={[
        { label: 'Rounds', value: races.length },
        ...(leader
          ? [
              { label: 'Points', value: leader.points },
              { label: 'Wins', value: leader.wins },
            ]
          : []),
      ]}
    />,
    size,
  )
}
