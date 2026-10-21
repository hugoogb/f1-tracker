import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeftRight } from 'lucide-react'
import { api } from '@/lib/api'
import type { Constructor } from '@/lib/types'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { Panel, PanelContent, PanelHeader, PanelTitle } from '@/components/ui/panel'
import { cn } from '@/lib/utils'
import { ComparisonChart } from '@/components/charts/comparison-chart'
import { FadeIn } from '@/components/ui/motion'
import { buildMetadata } from '@/lib/seo'
import { buttonVariants } from '@/components/ui/button-variants'
import { sideColor } from '@/lib/chart-theme'

interface ConstructorStats {
  total_entries: number
  wins: number
  podiums: number
  total_points: number
}

interface CompareConstructorsResponse {
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

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ c1?: string; c2?: string }>
}) {
  const params = await searchParams

  // Every pairing is its own URL, so the results are kept out of the index and
  // `/compare` is the canonical entry point for them.
  const seo = (title: string, description: string) =>
    buildMetadata({ title, description, path: '/compare', noindex: true })

  const generic = () =>
    seo(
      'Compare Constructors',
      'Compare any two Formula 1 constructors head-to-head — race entries, wins, podiums, points and season-by-season form.',
    )

  if (!params.c1 || !params.c2) return generic()

  try {
    const data = (await api.compare.constructors(
      params.c1,
      params.c2,
    )) as CompareConstructorsResponse
    return seo(
      `${data.constructor1.name} vs ${data.constructor2.name}`,
      `${data.constructor1.name} against ${data.constructor2.name}: head-to-head race record, wins, podiums and points across every season they shared.`,
    )
  } catch {
    return generic()
  }
}

const statLabels = [
  { key: 'total_entries' as const, label: 'Races' },
  { key: 'wins' as const, label: 'Wins' },
  { key: 'podiums' as const, label: 'Podiums' },
  { key: 'total_points' as const, label: 'Points' },
]

export default async function CompareConstructorsPage({
  searchParams,
}: {
  searchParams: Promise<{ c1?: string; c2?: string }>
}) {
  const params = await searchParams
  if (!params.c1 || !params.c2) redirect('/compare')

  let data: CompareConstructorsResponse
  try {
    data = (await api.compare.constructors(params.c1, params.c2)) as CompareConstructorsResponse
  } catch {
    redirect('/compare')
  }

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
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
            <div className="flex min-w-0 flex-1 items-center justify-center gap-3 sm:justify-end">
              {constructor1.color && (
                <span
                  className="inline-block size-4"
                  style={{ backgroundColor: constructor1.color }}
                />
              )}
              <h1 className="min-w-0 text-3xl break-words sm:text-4xl lg:text-5xl">
                <Link
                  href={`/constructors/${constructor1.ref}`}
                  className="hover:text-primary transition-colors"
                >
                  {constructor1.name}
                </Link>
              </h1>
            </div>
            <span className="text-muted-foreground display shrink-0 text-xl">vs</span>
            <div className="flex min-w-0 flex-1 items-center justify-center gap-3 sm:justify-start">
              <h1 className="min-w-0 text-3xl break-words sm:text-4xl lg:text-5xl">
                <Link
                  href={`/constructors/${constructor2.ref}`}
                  className="hover:text-primary transition-colors"
                >
                  {constructor2.name}
                </Link>
              </h1>
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
              href={`/compare/constructors?c1=${params.c2}&c2=${params.c1}`}
              className={buttonVariants({ variant: 'outline' })}
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
              Swap constructors
            </Link>
          </div>
        </div>
      </FadeIn>

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
