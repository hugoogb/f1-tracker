import Link from 'next/link'
import { Gauge } from 'lucide-react'
import { api } from '@/lib/api'

/**
 * "#5 of 76 best seasons", linking to the ranking.
 *
 * Fetches its own data so the season page only has to place it. Optional by
 * design: a running season has no rank yet, and an API failure renders nothing
 * rather than taking the season page down.
 */
export async function SeasonRankBadge({ year }: { year: number }) {
  let data
  try {
    data = await api.bestSeasons.season(year)
  } catch {
    return null
  }
  const { season, rankedSeasons } = data
  if (season.rank === null) return null

  return (
    <Link
      href="/best-seasons"
      className="skew-tag border-hairline-strong hover:border-primary focus-ring font-data inline-block border px-2.5 py-0.5 text-xs transition-colors"
      title={`Competitiveness score ${season.score.total.toFixed(1)} / 100`}
    >
      <span className="inline-flex items-center gap-1.5">
        <Gauge className="text-primary size-3.5" aria-hidden />
        <span className="tabular-nums">
          #{season.rank} of {rankedSeasons} best seasons
        </span>
        <span className="text-muted-foreground tabular-nums">
          · {season.score.total.toFixed(1)}
        </span>
      </span>
    </Link>
  )
}
