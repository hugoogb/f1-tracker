import Link from 'next/link'
import { ArrowLeftRight, Users } from 'lucide-react'
import type { Driver, RadarStats } from '@/lib/types'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { Panel, PanelContent, PanelHeader, PanelTitle } from '@/components/ui/panel'
import { DriverAvatar } from '@/components/ui/driver-avatar'
import { PageSummary } from '@/components/ui/page-summary'
import { cn } from '@/lib/utils'
import { ComparisonChart } from '@/components/charts/comparison-chart'
import { DriverRadarChart } from '@/components/charts/driver-radar-chart'
import { HeadToHeadCard } from '@/components/compare/head-to-head-card'
import { CareerStatsTable } from '@/components/compare/career-stats-table'
import { FadeIn } from '@/components/ui/motion'
import { buttonVariants } from '@/components/ui/button-variants'
import { driverPairSummary } from '@/lib/page-summary'

interface DriverStats {
  total_races: number
  wins: number
  podiums: number
  poles: number
  fastest_laps: number
  championships: number
  total_points: number
}

interface HeadToHead {
  driver1Wins: number
  driver2Wins: number
  totalRaces: number
}

export interface DriverCompareResponse {
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

/** The big names either side of "vs": styled as a heading, but the page has one h1. */
const SIDE_NAME =
  'font-display min-w-0 text-3xl leading-[0.9] font-extrabold break-words uppercase italic sm:text-4xl lg:text-5xl'

export function driverCompareSummary(data: DriverCompareResponse): string {
  const side = (d: DriverCompareResponse['driver1']) => ({
    name: `${d.firstName} ${d.lastName}`,
    lastName: d.lastName,
    wins: d.stats.wins,
    starts: d.stats.total_races,
    championships: d.stats.championships,
  })
  return driverPairSummary({
    one: side(data.driver1),
    two: side(data.driver2),
    race: data.headToHead,
    qualifying: data.qualifyingHeadToHead,
    teammateSeasons: data.teammateSeasons,
  })
}

/** One head-to-head: the query-string view and the curated pages both draw this. */
export function DriverComparison({
  data,
  isTeammate = false,
}: {
  data: DriverCompareResponse
  isTeammate?: boolean
}) {
  const summary = driverCompareSummary(data)
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
        <div className="brackets bg-surface-1 border-hairline border px-4 py-6 sm:px-6 sm:py-8">
          <h1 className="font-data text-muted-foreground mb-4 text-center text-sm leading-normal font-semibold tracking-wider not-italic lg:text-sm">
            {d1Name} vs {d2Name}: F1 head to head
          </h1>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
            <div className="flex min-w-0 flex-1 items-center justify-center gap-3 sm:justify-end">
              <p className={SIDE_NAME}>
                <Link
                  href={`/drivers/${driver1.ref}`}
                  className="hover:text-primary transition-colors"
                >
                  {d1Name}
                </Link>
              </p>
              <DriverAvatar firstName={driver1.firstName} lastName={driver1.lastName} size="lg" />
            </div>
            <span className="text-muted-foreground display shrink-0 text-xl">vs</span>
            <div className="flex min-w-0 flex-1 items-center justify-center gap-3 sm:justify-start">
              <DriverAvatar firstName={driver2.firstName} lastName={driver2.lastName} size="lg" />
              <p className={SIDE_NAME}>
                <Link
                  href={`/drivers/${driver2.ref}`}
                  className="hover:text-primary transition-colors"
                >
                  {d2Name}
                </Link>
              </p>
            </div>
          </div>

          <div className="mt-4 flex justify-center gap-2">
            <Link
              href={`/compare/drivers?d1=${driver2.ref}&d2=${driver1.ref}${isTeammate ? '&teammate=true' : ''}`}
              className={buttonVariants({ variant: 'outline' })}
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
              Swap
            </Link>
            {teammateSeasons.length > 0 && (
              <Link
                href={`/compare/drivers?d1=${driver1.ref}&d2=${driver2.ref}${isTeammate ? '' : '&teammate=true'}`}
                className={cn(
                  buttonVariants({ variant: 'outline' }),
                  isTeammate && 'border-primary/50 bg-primary/10 text-primary',
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

      <PageSummary text={summary} />

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
        <Panel>
          <PanelHeader>
            <PanelTitle>Performance Profile</PanelTitle>
          </PanelHeader>
          <PanelContent>
            <DriverRadarChart
              driver1Name={driver1.lastName}
              driver2Name={driver2.lastName}
              driver1Radar={driver1Radar}
              driver2Radar={driver2Radar}
            />
          </PanelContent>
        </Panel>
      </FadeIn>

      {/* Career Points Chart */}
      {(driver1Seasons.length > 0 || driver2Seasons.length > 0) && (
        <FadeIn>
          <Panel>
            <PanelHeader>
              <PanelTitle>Career Points per Season</PanelTitle>
            </PanelHeader>
            <PanelContent>
              <ComparisonChart
                driver1Name={driver1.lastName}
                driver2Name={driver2.lastName}
                driver1Seasons={driver1Seasons}
                driver2Seasons={driver2Seasons}
              />
            </PanelContent>
          </Panel>
        </FadeIn>
      )}
    </div>
  )
}
