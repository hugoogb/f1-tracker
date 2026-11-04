import Link from 'next/link'
import { ArrowLeftRight } from 'lucide-react'
import type { Constructor } from '@/lib/types'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { Panel, PanelContent, PanelHeader, PanelTitle } from '@/components/ui/panel'
import { PageSummary } from '@/components/ui/page-summary'
import { cn } from '@/lib/utils'
import { ComparisonChart } from '@/components/charts/comparison-chart'
import { FadeIn } from '@/components/ui/motion'
import { buttonVariants } from '@/components/ui/button-variants'
import { sideColor } from '@/lib/chart-theme'
import { constructorPairSummary } from '@/lib/page-summary'

interface ConstructorStats {
  total_entries: number
  wins: number
  podiums: number
  total_points: number
}

export interface ConstructorCompareResponse {
  constructor1: Constructor & { stats: ConstructorStats }
  constructor2: Constructor & { stats: ConstructorStats }
  headToHead: {
    constructor1Wins: number
    constructor2Wins: number
    totalRaces: number
  }
  constructor1Seasons: { year: number; points: number }[]
  constructor2Seasons: { year: number; points: number }[]
}

/** The big names either side of "vs": styled as a heading, but the page has one h1. */
const SIDE_NAME =
  'font-display min-w-0 text-3xl leading-[0.9] font-extrabold break-words uppercase italic sm:text-4xl lg:text-5xl'

const statLabels = [
  { key: 'total_entries' as const, label: 'Races' },
  { key: 'wins' as const, label: 'Wins' },
  { key: 'podiums' as const, label: 'Podiums' },
  { key: 'total_points' as const, label: 'Points' },
]

export function constructorCompareSummary(data: ConstructorCompareResponse): string {
  const side = (c: ConstructorCompareResponse['constructor1']) => ({
    name: c.name,
    wins: c.stats.wins,
    entries: c.stats.total_entries,
  })
  return constructorPairSummary({
    one: side(data.constructor1),
    two: side(data.constructor2),
    race: data.headToHead,
  })
}

/** One head-to-head: the query-string view and the curated pages both draw this. */
export function ConstructorComparison({ data }: { data: ConstructorCompareResponse }) {
  const summary = constructorCompareSummary(data)
  const { constructor1, constructor2, headToHead, constructor1Seasons, constructor2Seasons } = data
  const c1Color = constructor1.color ?? sideColor('a')
  const c2Color = constructor2.color ?? sideColor('b')

  return (
    <div className="space-y-8">
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: 'Compare', href: '/compare' },
          { label: `${constructor1.name} vs ${constructor2.name}` },
        ]}
      />

      <FadeIn>
        <div className="brackets bg-surface-1 border-hairline border px-4 py-6 sm:px-6 sm:py-8">
          <h1 className="font-data text-muted-foreground mb-4 text-center text-sm leading-normal font-semibold tracking-wider not-italic lg:text-sm">
            {constructor1.name} vs {constructor2.name}: F1 head to head
          </h1>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
            <div className="flex min-w-0 flex-1 items-center justify-center gap-3 sm:justify-end">
              {constructor1.color && (
                <span
                  className="inline-block size-4"
                  style={{ backgroundColor: constructor1.color }}
                />
              )}
              <p className={SIDE_NAME}>
                <Link
                  href={`/constructors/${constructor1.ref}`}
                  className="hover:text-primary transition-colors"
                >
                  {constructor1.name}
                </Link>
              </p>
            </div>
            <span className="text-muted-foreground display shrink-0 text-xl">vs</span>
            <div className="flex min-w-0 flex-1 items-center justify-center gap-3 sm:justify-start">
              <p className={SIDE_NAME}>
                <Link
                  href={`/constructors/${constructor2.ref}`}
                  className="hover:text-primary transition-colors"
                >
                  {constructor2.name}
                </Link>
              </p>
              {constructor2.color && (
                <span
                  className="inline-block size-4"
                  style={{ backgroundColor: constructor2.color }}
                />
              )}
            </div>
          </div>

          <div className="mt-4 flex justify-center">
            <Link
              href={`/compare/constructors?c1=${constructor2.ref}&c2=${constructor1.ref}`}
              className={buttonVariants({ variant: 'outline' })}
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
              Swap constructors
            </Link>
          </div>
        </div>
      </FadeIn>

      <PageSummary text={summary} />

      {/* Head to Head */}
      <FadeIn>
        <Panel>
          <PanelHeader>
            <PanelTitle>Head to Head</PanelTitle>
          </PanelHeader>
          <PanelContent>
            <div className="flex items-center gap-4">
              <div className="flex-1 text-right">
                <p className="text-3xl font-bold tabular-nums" style={{ color: c1Color }}>
                  {headToHead.constructor1Wins}
                </p>
                <p className="text-muted-foreground text-sm font-medium">{constructor1.name}</p>
              </div>
              <div className="flex flex-col items-center">
                <p className="text-muted-foreground text-sm">from</p>
                <p className="text-lg font-semibold">{headToHead.totalRaces}</p>
                <p className="text-muted-foreground text-sm">shared races</p>
              </div>
              <div className="flex-1">
                <p className="text-3xl font-bold tabular-nums" style={{ color: c2Color }}>
                  {headToHead.constructor2Wins}
                </p>
                <p className="text-muted-foreground text-sm font-medium">{constructor2.name}</p>
              </div>
            </div>
            {headToHead.totalRaces > 0 && (
              <div className="bg-surface-3 mt-4 flex h-4 overflow-hidden">
                <div
                  className="text-2xs flex items-center justify-center font-bold text-white transition-all duration-500"
                  style={{
                    width: `${(headToHead.constructor1Wins / headToHead.totalRaces) * 100}%`,
                    backgroundColor: c1Color,
                  }}
                >
                  {headToHead.constructor1Wins > 0 &&
                    `${Math.round((headToHead.constructor1Wins / headToHead.totalRaces) * 100)}%`}
                </div>
                <div
                  className="text-2xs flex items-center justify-center font-bold text-white transition-all duration-500"
                  style={{
                    width: `${(headToHead.constructor2Wins / headToHead.totalRaces) * 100}%`,
                    backgroundColor: c2Color,
                  }}
                >
                  {headToHead.constructor2Wins > 0 &&
                    `${Math.round((headToHead.constructor2Wins / headToHead.totalRaces) * 100)}%`}
                </div>
              </div>
            )}
          </PanelContent>
        </Panel>
      </FadeIn>

      {/* Stat-by-Stat Comparison */}
      <FadeIn>
        <Panel>
          <PanelHeader>
            <PanelTitle>Career Stats</PanelTitle>
          </PanelHeader>
          <PanelContent className="space-y-0 divide-y">
            {statLabels.map(({ key, label }) => {
              const v1 = constructor1.stats[key]
              const v2 = constructor2.stats[key]
              const c1Higher = v1 > v2
              const c2Higher = v2 > v1

              return (
                <div key={key} className="flex items-center py-3">
                  <span
                    className={cn(
                      'display flex-1 text-right text-xl tabular-nums',
                      c1Higher ? '' : 'text-muted-foreground',
                    )}
                    style={c1Higher ? { color: c1Color } : undefined}
                  >
                    {v1.toLocaleString()}
                  </span>
                  <span className="text-muted-foreground w-24 text-center text-sm font-medium">
                    {label}
                  </span>
                  <span
                    className={cn(
                      'display flex-1 text-xl tabular-nums',
                      c2Higher ? '' : 'text-muted-foreground',
                    )}
                    style={c2Higher ? { color: c2Color } : undefined}
                  >
                    {v2.toLocaleString()}
                  </span>
                </div>
              )
            })}
          </PanelContent>
        </Panel>
      </FadeIn>

      {/* Career Points Chart */}
      {(constructor1Seasons.length > 0 || constructor2Seasons.length > 0) && (
        <FadeIn>
          <Panel>
            <PanelHeader>
              <PanelTitle>Career Points per Season</PanelTitle>
            </PanelHeader>
            <PanelContent>
              <ComparisonChart
                driver1Name={constructor1.name}
                driver2Name={constructor2.name}
                driver1Seasons={constructor1Seasons}
                driver2Seasons={constructor2Seasons}
                color1={c1Color}
                color2={c2Color}
              />
            </PanelContent>
          </Panel>
        </FadeIn>
      )}
    </div>
  )
}
