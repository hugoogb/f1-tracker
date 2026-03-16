import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeftRight, Users } from 'lucide-react'
import { api } from '@/lib/api'
import type { Driver, RadarStats } from '@/lib/types'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DriverAvatar } from '@/components/ui/driver-avatar'
import { cn } from '@/lib/utils'
import { ComparisonChart } from '@/components/charts/comparison-chart'
import { DriverRadarChart } from '@/components/charts/driver-radar-chart'
import { HeadToHeadCard } from '@/components/compare/head-to-head-card'
import { CareerStatsTable } from '@/components/compare/career-stats-table'
import { FadeIn } from '@/components/ui/motion'

export const dynamic = 'force-dynamic'

interface DriverStats {
  total_races: number
  wins: number
  podiums: number
  poles: number
  fastest_laps: number
  total_points: number
}

interface HeadToHead {
  driver1Wins: number
  driver2Wins: number
  totalRaces: number
}

interface CompareResponse {
  driver1: Driver & { stats: DriverStats }
  driver2: Driver & { stats: DriverStats }
  headToHead: HeadToHead
  qualifyingHeadToHead: HeadToHead
  teammateSeasons: number[]
  driver1Radar: RadarStats
  driver2Radar: RadarStats
  driver1Seasons: { year: number; points: number }[]
  driver2Seasons: { year: number; points: number }[]
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ d1?: string; d2?: string }>
}) {
  const params = await searchParams
  if (!params.d1 || !params.d2) return { title: 'Compare Drivers | F1 Tracker' }

  try {
    const data = (await api.compare.drivers(params.d1, params.d2)) as CompareResponse
    return {
      title: `${data.driver1.lastName} vs ${data.driver2.lastName} | F1 Tracker`,
      description: `Head-to-head comparison of ${data.driver1.firstName} ${data.driver1.lastName} and ${data.driver2.firstName} ${data.driver2.lastName}`,
    }
  } catch {
    return { title: 'Compare Drivers | F1 Tracker' }
  }
}

export default async function CompareDriversPage({
  searchParams,
}: {
  searchParams: Promise<{ d1?: string; d2?: string; teammate?: string }>
}) {
  const params = await searchParams
  if (!params.d1 || !params.d2) redirect('/compare')

  const isTeammate = params.teammate === 'true'

  let data: CompareResponse
  try {
    data = (await api.compare.drivers(params.d1, params.d2, isTeammate)) as CompareResponse
  } catch {
    redirect('/compare')
  }

  const {
    driver1,
    driver2,
    headToHead,
    qualifyingHeadToHead,
    teammateSeasons,
    driver1Radar,
    driver2Radar,
    driver1Seasons,
    driver2Seasons,
  } = data
  const d1Name = `${driver1.firstName} ${driver1.lastName}`
  const d2Name = `${driver2.firstName} ${driver2.lastName}`

  return (
    <div className="space-y-8">
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: 'Compare', href: '/compare' },
          { label: `${driver1.lastName} vs ${driver2.lastName}` },
        ]}
      />

      <FadeIn>
        <div className="glass rounded-xl px-6 py-8">
          <div className="flex items-center gap-4">
            <div className="flex flex-1 items-center justify-end gap-3">
              <h1>
                <Link
                  href={`/drivers/${driver1.ref}`}
                  className="hover:text-primary transition-colors"
                >
                  {d1Name}
                </Link>
              </h1>
              <DriverAvatar
                firstName={driver1.firstName}
                lastName={driver1.lastName}
                headshotUrl={driver1.headshotUrl}
                size="lg"
              />
            </div>
            <span className="text-muted-foreground font-heading shrink-0 text-xl font-bold">
              vs
            </span>
            <div className="flex flex-1 items-center gap-3">
              <DriverAvatar
                firstName={driver2.firstName}
                lastName={driver2.lastName}
                headshotUrl={driver2.headshotUrl}
                size="lg"
              />
              <h1>
                <Link
                  href={`/drivers/${driver2.ref}`}
                  className="hover:text-primary transition-colors"
                >
                  {d2Name}
                </Link>
              </h1>
            </div>
          </div>

          <div className="mt-4 flex justify-center gap-2">
            <Link
              href={`/compare/drivers?d1=${params.d2}&d2=${params.d1}${isTeammate ? '&teammate=true' : ''}`}
              className="border-border inline-flex h-8 items-center gap-1.5 rounded-lg border bg-[var(--surface-1)] px-2.5 text-sm font-medium transition-all hover:bg-[var(--surface-2)]"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
              Swap
            </Link>
            {teammateSeasons.length > 0 && (
              <Link
                href={`/compare/drivers?d1=${params.d1}&d2=${params.d2}${isTeammate ? '' : '&teammate=true'}`}
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm font-medium transition-all',
                  isTeammate
                    ? 'border-primary/50 bg-primary/10 text-primary'
                    : 'border-border bg-[var(--surface-1)] hover:bg-[var(--surface-2)]',
                )}
              >
                <Users className="h-3.5 w-3.5" />
                Teammates only
              </Link>
            )}
          </div>

          {isTeammate && teammateSeasons.length > 0 && (
            <p className="text-muted-foreground mt-3 text-center text-xs">
              Teammates in {teammateSeasons.join(', ')}
            </p>
          )}
        </div>
      </FadeIn>

      <div className="accent-line" />

      {/* Head to Head - Race + Qualifying */}
      <div className="grid gap-6 md:grid-cols-2">
        <FadeIn>
          <HeadToHeadCard
            title="Race Head to Head"
            h2h={headToHead}
            driver1LastName={driver1.lastName}
            driver2LastName={driver2.lastName}
          />
        </FadeIn>
        {qualifyingHeadToHead.totalRaces > 0 && (
          <FadeIn>
            <HeadToHeadCard
              title="Qualifying Head to Head"
              h2h={qualifyingHeadToHead}
              driver1LastName={driver1.lastName}
              driver2LastName={driver2.lastName}
            />
          </FadeIn>
        )}
      </div>

      {/* Stat-by-Stat Comparison */}
      <FadeIn>
        <CareerStatsTable driver1Stats={driver1.stats} driver2Stats={driver2.stats} />
      </FadeIn>

      {/* Radar Chart */}
      <FadeIn>
        <Card>
          <CardHeader>
            <CardTitle>Performance Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <DriverRadarChart
              driver1Name={driver1.lastName}
              driver2Name={driver2.lastName}
              driver1Radar={driver1Radar}
              driver2Radar={driver2Radar}
            />
          </CardContent>
        </Card>
      </FadeIn>

      {/* Career Points Chart */}
      {(driver1Seasons.length > 0 || driver2Seasons.length > 0) && (
        <FadeIn>
          <Card>
            <CardHeader>
              <CardTitle>Career Points per Season</CardTitle>
            </CardHeader>
            <CardContent>
              <ComparisonChart
                driver1Name={driver1.lastName}
                driver2Name={driver2.lastName}
                driver1Seasons={driver1Seasons}
                driver2Seasons={driver2Seasons}
              />
            </CardContent>
          </Card>
        </FadeIn>
      )}
    </div>
  )
}
