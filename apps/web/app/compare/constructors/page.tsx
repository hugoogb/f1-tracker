import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeftRight } from 'lucide-react'
import { api } from '@/lib/api'
import type { Constructor } from '@/lib/types'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { ComparisonChart } from '@/components/charts/comparison-chart'
import { FadeIn } from '@/components/ui/motion'

export const dynamic = 'force-dynamic'

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
  if (!params.c1 || !params.c2) return { title: 'Compare Constructors | F1 Tracker' }

  try {
    const data = (await api.compare.constructors(
      params.c1,
      params.c2,
    )) as CompareConstructorsResponse
    return {
      title: `${data.constructor1.name} vs ${data.constructor2.name} | F1 Tracker`,
      description: `Head-to-head comparison of ${data.constructor1.name} and ${data.constructor2.name}`,
    }
  } catch {
    return { title: 'Compare Constructors | F1 Tracker' }
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
  const c1Color = constructor1.color ?? '#E8002D'
  const c2Color = constructor2.color ?? '#3671C6'

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
        <div className="glass rounded-xl px-6 py-8">
          <div className="flex items-center gap-4">
            <div className="flex flex-1 items-center justify-end gap-3">
              {constructor1.color && (
                <span
                  className="inline-block size-4 rounded-full"
                  style={{ backgroundColor: constructor1.color }}
                />
              )}
              <h1>
                <Link
                  href={`/constructors/${constructor1.ref}`}
                  className="hover:text-primary transition-colors"
                >
                  {constructor1.name}
                </Link>
              </h1>
            </div>
            <span className="text-muted-foreground font-heading shrink-0 text-xl font-bold">
              vs
            </span>
            <div className="flex flex-1 items-center gap-3">
              <h1>
                <Link
                  href={`/constructors/${constructor2.ref}`}
                  className="hover:text-primary transition-colors"
                >
                  {constructor2.name}
                </Link>
              </h1>
              {constructor2.color && (
                <span
                  className="inline-block size-4 rounded-full"
                  style={{ backgroundColor: constructor2.color }}
                />
              )}
            </div>
          </div>

          <div className="mt-4 flex justify-center">
            <Link
              href={`/compare/constructors?c1=${params.c2}&c2=${params.c1}`}
              className="border-border inline-flex h-8 items-center gap-1.5 rounded-lg border bg-[var(--surface-1)] px-2.5 text-sm font-medium transition-all hover:bg-[var(--surface-2)]"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
              Swap constructors
            </Link>
          </div>
        </div>
      </FadeIn>

      <div className="accent-line" />

      {/* Head to Head */}
      <FadeIn>
        <Card>
          <CardHeader>
            <CardTitle>Head to Head</CardTitle>
          </CardHeader>
          <CardContent>
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
              <div className="bg-muted mt-4 flex h-4 overflow-hidden rounded-full">
                <div
                  className="flex items-center justify-center rounded-l-full text-[10px] font-bold text-white transition-all duration-500"
                  style={{
                    width: `${(headToHead.constructor1Wins / headToHead.totalRaces) * 100}%`,
                    backgroundColor: c1Color,
                  }}
                >
                  {headToHead.constructor1Wins > 0 &&
                    `${Math.round((headToHead.constructor1Wins / headToHead.totalRaces) * 100)}%`}
                </div>
                <div
                  className="flex items-center justify-center rounded-r-full text-[10px] font-bold text-white transition-all duration-500"
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
          </CardContent>
        </Card>
      </FadeIn>

      {/* Stat-by-Stat Comparison */}
      <FadeIn>
        <Card>
          <CardHeader>
            <CardTitle>Career Stats</CardTitle>
          </CardHeader>
          <CardContent className="space-y-0 divide-y">
            {statLabels.map(({ key, label }) => {
              const v1 = constructor1.stats[key]
              const v2 = constructor2.stats[key]
              const c1Higher = v1 > v2
              const c2Higher = v2 > v1

              return (
                <div key={key} className="flex items-center py-3">
                  <span
                    className={cn(
                      'font-heading flex-1 text-right text-xl font-bold tabular-nums',
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
                      'font-heading flex-1 text-xl font-bold tabular-nums',
                      c2Higher ? '' : 'text-muted-foreground',
                    )}
                    style={c2Higher ? { color: c2Color } : undefined}
                  >
                    {v2.toLocaleString()}
                  </span>
                </div>
              )
            })}
          </CardContent>
        </Card>
      </FadeIn>

      {/* Career Points Chart */}
      {(constructor1Seasons.length > 0 || constructor2Seasons.length > 0) && (
        <FadeIn>
          <Card>
            <CardHeader>
              <CardTitle>Career Points per Season</CardTitle>
            </CardHeader>
            <CardContent>
              <ComparisonChart
                driver1Name={constructor1.name}
                driver2Name={constructor2.name}
                driver1Seasons={constructor1Seasons}
                driver2Seasons={constructor2Seasons}
                color1={c1Color}
                color2={c2Color}
              />
            </CardContent>
          </Card>
        </FadeIn>
      )}
    </div>
  )
}
