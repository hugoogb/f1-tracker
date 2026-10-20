import { Suspense } from 'react'
import { Flag, Gauge, Swords, Trophy } from 'lucide-react'
import { api } from '@/lib/api'
import type { BestSeason, PointsSystem } from '@/lib/types'
import { buildMetadata } from '@/lib/seo'
import { teamColorOf } from '@/lib/utils'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatCard } from '@/components/ui/stat-card'
import { Skeleton } from '@/components/ui/skeleton'
import { FadeIn } from '@/components/ui/motion'
import { SeasonPodium } from '@/components/best-seasons/season-podium'
import {
  CompetitivenessChart,
  type ChartEra,
} from '@/components/best-seasons/competitiveness-chart'
import { BestSeasonsTable } from '@/components/best-seasons/best-seasons-table'
import { ScoreLegend, componentColor } from '@/components/best-seasons/score-breakdown-bar'
import { formatPoints } from '@/components/best-seasons/format'

export const metadata = buildMetadata({
  title: 'Best Seasons',
  description:
    'Every Formula 1 season since 1950 ranked by how good a title fight it was — title margin, how late it was decided, finale contenders, different winners and lead changes.',
  path: '/best-seasons',
  image: '/best-seasons/opengraph-image',
  imageAlt: 'The greatest Formula 1 championship seasons, ranked',
})

/**
 * A points system's season range, from its `era` string: "1950-1959", a single
 * "1960", or an open-ended "2025-" that runs to the latest ranked season.
 */
function toChartEra(system: PointsSystem, latest: number): ChartEra {
  const [start, end] = system.era.split('-')
  const from = parseInt(start, 10)
  const to = end === undefined ? from : end === '' ? latest : parseInt(end, 10)
  return {
    id: system.id,
    label: `${system.era} · ${system.label}`,
    short: system.era,
    from,
    to,
  }
}

function pick(seasons: BestSeason[], score: (s: BestSeason) => number | null, low = false) {
  let best: BestSeason | null = null
  for (const season of seasons) {
    const value = score(season)
    if (value === null) continue
    const current = best ? score(best) : null
    if (current === null || (low ? value < current : value > current)) best = season
  }
  return best
}

export default async function BestSeasonsPage() {
  const [rankings, systems] = await Promise.allSettled([
    api.bestSeasons.list(),
    api.pointsSystems(),
  ])

  // The ranking is the page; without it there is nothing to show but an error.
  if (rankings.status === 'rejected') throw rankings.reason

  const { seasons, components, notes } = rankings.value
  const latest = seasons.reduce((max, s) => Math.max(max, s.year), 0)
  const eras: ChartEra[] =
    systems.status === 'fulfilled' ? systems.value.systems.map((s) => toChartEra(s, latest)) : []

  const finales = seasons.filter((s) => s.wentToFinalRound).length
  const closest = pick(seasons, (s) => s.titleMarginShare, true)
  const mostWinners = pick(seasons, (s) => s.distinctWinners)
  const mostLeads = pick(seasons, (s) => s.leadChanges)

  return (
    <div className="space-y-8">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Best Seasons' }]} />

      <PageHeader
        title="Best Seasons"
        description="Every completed championship since 1950, ranked by how good a title fight it was to watch: how close it finished, how late it was settled, and how many drivers were in it."
      />

      <section aria-labelledby="podium-heading" className="space-y-4">
        <h2 id="podium-heading" className="sr-only">
          The three greatest seasons
        </h2>
        <SeasonPodium seasons={seasons} />
      </section>

      <FadeIn>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Went to the final round"
            value={finales}
            icon={Flag}
            description={`of ${seasons.length} completed seasons`}
          />
          {closest && (
            <StatCard
              label="Closest finish"
              value={`${formatPoints(closest.titleMargin)} pt${closest.titleMargin === 1 ? '' : 's'}`}
              icon={Swords}
              href={`/seasons/${closest.year}`}
              color={teamColorOf(closest.champion?.constructor?.color) ?? undefined}
              description={`${closest.year} · ${closest.champion?.driver.lastName} over ${closest.runnerUp?.driver.lastName}`}
            />
          )}
          {mostWinners && (
            <StatCard
              label="Most different winners"
              value={mostWinners.distinctWinners}
              icon={Trophy}
              href={`/seasons/${mostWinners.year}`}
              color={teamColorOf(mostWinners.champion?.constructor?.color) ?? undefined}
              description={`${mostWinners.year}, in ${mostWinners.totalRounds} rounds`}
            />
          )}
          {mostLeads && (
            <StatCard
              label="Most lead changes"
              value={mostLeads.leadChanges}
              icon={Gauge}
              href={`/seasons/${mostLeads.year}`}
              color={teamColorOf(mostLeads.champion?.constructor?.color) ?? undefined}
              description={`${mostLeads.year}, ${mostLeads.distinctLeaders} different leaders`}
            />
          )}
        </div>
      </FadeIn>

      <FadeIn>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Competitiveness through the years</CardTitle>
            <p className="text-muted-foreground text-sm">
              Each dot is a season in its champion&apos;s team colour; the bands are the
              points-system eras. Click a season to open it.
            </p>
          </CardHeader>
          <CardContent>
            <CompetitivenessChart seasons={seasons} eras={eras} />
          </CardContent>
        </Card>
      </FadeIn>

      <FadeIn>
        <Card>
          <CardHeader className="space-y-2">
            <CardTitle className="text-base">The full ranking</CardTitle>
            <ScoreLegend components={components} />
          </CardHeader>
          <CardContent>
            {/* `useSearchParams` in the table needs a boundary; everything above
                stays in the prerendered HTML. */}
            <Suspense fallback={<Skeleton className="h-96 w-full" />}>
              <BestSeasonsTable seasons={seasons} eras={eras} />
            </Suspense>
          </CardContent>
        </Card>
      </FadeIn>

      <FadeIn>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">How the score works</CardTitle>
            <p className="text-muted-foreground text-sm">
              A season scores out of 100: five measures of a title fight, each worth a fixed share.
              It is an opinion about what makes a championship good to watch, written down so you
              can disagree with the weights rather than guess at them.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <ul className="grid gap-4 md:grid-cols-2">
              {components.map((c) => (
                <li key={c.id} className="flex gap-3">
                  <span
                    aria-hidden
                    className="mt-1 h-10 w-1 shrink-0 rounded-full"
                    style={{ backgroundColor: componentColor(c.id) }}
                  />
                  <div>
                    <p className="font-medium">
                      {c.label}{' '}
                      <span className="text-muted-foreground text-sm tabular-nums">
                        · {c.weight} points
                      </span>
                    </p>
                    <p className="text-muted-foreground text-sm">{c.description}</p>
                  </div>
                </li>
              ))}
            </ul>
            <ul className="text-muted-foreground list-disc space-y-1.5 pl-5 text-sm">
              {notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </FadeIn>
    </div>
  )
}
