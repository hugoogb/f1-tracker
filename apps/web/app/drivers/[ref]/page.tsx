import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Flag, Trophy, Medal, TrendingUp, GitCompareArrows, Timer, Zap, Award } from 'lucide-react'
import { api, isNotFound } from '@/lib/api'
import type { Driver, DriverSeasonSummary, DriverPaceResponse } from '@/lib/types'
import { teamColorOf } from '@/lib/utils'
import { CountryFlag } from '@/components/ui/country-flag'
import { DriverAvatar } from '@/components/ui/driver-avatar'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { Badge } from '@/components/ui/badge'
import { StatCard } from '@/components/ui/stat-card'
import { SeasonHistoryTable } from '@/components/drivers/season-history-table'
import { CareerPointsChart } from '@/components/charts/career-points-chart'
import { QualiVsRaceChart } from '@/components/charts/quali-vs-race-chart'
import { FadeIn, StaggerList, StaggerItem } from '@/components/ui/motion'
import { JsonLd } from '@/components/seo/json-ld'
import { personSchema } from '@/lib/structured-data'
import { buildMetadata, SITE_DESCRIPTION } from '@/lib/seo'
import { LocalDate } from '@/components/ui/local-date'

interface DriverDetail extends Driver {
  stats: {
    total_races: number
    wins: number
    podiums: number
    poles: number
    fastest_laps: number
    championships: number
    total_points: number
  }
}

/**
 * Nothing is prerendered at build time: there are thousands of these pages and
 * the set changes with the data, so a build should not have to walk it. The
 * empty list still opts the route into the full route cache — the first request
 * for a path renders it, everything after is served from the cache until the
 * `f1-data` tag is purged by an ingest.
 */
export function generateStaticParams() {
  return []
}

export async function generateMetadata({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params
  let driver: DriverDetail
  try {
    driver = (await api.drivers.get(ref)) as DriverDetail
  } catch {
    // The page itself decides between 404 and error; metadata must not throw.
    // Streaming means the 404 body still ships with a 200, so noindex is what
    // actually keeps a missing resource out of the index.
    return buildMetadata({
      title: 'Driver',
      description: SITE_DESCRIPTION,
      path: `/drivers/${ref}`,
      noindex: true,
    })
  }

  const name = `${driver.firstName} ${driver.lastName}`
  const { wins, poles, podiums, championships, total_races: races } = driver.stats
  const titles =
    championships === 1 ? '1 world championship' : `${championships} world championships`

  return buildMetadata({
    title: name,
    description:
      `${name}'s complete Formula 1 career: ${races} race starts, ${wins} wins, ${poles} poles, ` +
      `${podiums} podiums and ${titles}, with points by season and qualifying vs race pace.`,
    path: `/drivers/${ref}`,
    type: 'profile',
  })
}

export default async function DriverDetailPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params

  const [driver, seasonsResult, paceResult] = await Promise.allSettled([
    api.drivers.get(ref) as Promise<DriverDetail>,
    api.drivers.seasons(ref) as Promise<{ seasons: DriverSeasonSummary[] }>,
    api.drivers.pace(ref) as Promise<DriverPaceResponse>,
  ])

  // An unknown ref must answer 404, not 500 — but only when the API actually
  // said the driver is missing; an outage has to keep returning an error.
  if (driver.status === 'rejected') {
    if (isNotFound(driver.reason)) notFound()
    throw driver.reason
  }
  const driverData = driver.value
  const seasons = seasonsResult.status === 'fulfilled' ? seasonsResult.value.seasons : []
  const paceData = paceResult.status === 'fulfilled' ? paceResult.value : null

  const latestTeam = seasons[0]?.constructor
  const teamColor = latestTeam ? (teamColorOf(latestTeam.color, null) ?? undefined) : undefined

  return (
    <div className="space-y-8">
      <JsonLd
        data={personSchema({
          name: `${driverData.firstName} ${driverData.lastName}`,
          path: `/drivers/${ref}`,
          nationality: driverData.nationality,
          dateOfBirth: driverData.dateOfBirth,
          permanentNumber: driverData.number,
        })}
      />
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: 'Drivers', href: '/drivers' },
          { label: `${driverData.firstName} ${driverData.lastName}` },
        ]}
      />

      <FadeIn>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
          <DriverAvatar
            firstName={driverData.firstName}
            lastName={driverData.lastName}
            size="lg"
            teamColor={teamColor}
            className="rounded-2xl"
          />
          <div className="space-y-2">
            <h1>
              {driverData.firstName} {driverData.lastName}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              {driverData.nationality && (
                <span className="text-muted-foreground inline-flex items-center gap-1.5">
                  <CountryFlag code={driverData.countryCode} />
                  {driverData.nationality}
                </span>
              )}
              {driverData.dateOfBirth && (
                <span className="text-muted-foreground">
                  Born <LocalDate value={driverData.dateOfBirth} style="long" />
                </span>
              )}
              {driverData.number != null && <Badge variant="outline">#{driverData.number}</Badge>}
              {driverData.code && (
                <Badge variant="secondary" className="font-mono">
                  {driverData.code}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </FadeIn>

      <div className="accent-line" />

      <StaggerList className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {driverData.stats.championships > 0 && (
          <StaggerItem>
            <StatCard
              label="Championships"
              value={driverData.stats.championships}
              icon={Award}
              color={teamColor}
            />
          </StaggerItem>
        )}
        <StaggerItem>
          <StatCard
            label="Races"
            value={driverData.stats.total_races}
            icon={Flag}
            color={teamColor}
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Wins" value={driverData.stats.wins} icon={Trophy} color={teamColor} />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label="Podiums"
            value={driverData.stats.podiums}
            icon={Medal}
            color={teamColor}
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Poles" value={driverData.stats.poles} icon={Timer} color={teamColor} />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label="Fastest Laps"
            value={driverData.stats.fastest_laps}
            icon={Zap}
            color={teamColor}
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label="Points"
            value={driverData.stats.total_points}
            icon={TrendingUp}
            color={teamColor}
          />
        </StaggerItem>
      </StaggerList>

      <div className="flex">
        <Link
          href={`/compare?d1=${ref}`}
          className="bg-primary hover:bg-primary/90 text-primary-foreground glow-red inline-flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-medium transition-all"
        >
          <GitCompareArrows className="h-3.5 w-3.5" />
          Compare with...
        </Link>
      </div>

      {paceData &&
        paceData.seasons.filter((s) => s.avgQualiPosition !== null && s.avgRacePosition !== null)
          .length >= 2 && (
          <FadeIn>
            <div>
              <h2 className="mb-4">Qualifying vs Race Performance</h2>
              <QualiVsRaceChart seasons={paceData.seasons} color={teamColor} />
            </div>
          </FadeIn>
        )}

      <FadeIn>
        <div>
          <h2 className="mb-4">Season History</h2>
          <CareerPointsChart
            seasons={seasons.map((s) => ({ year: s.year, points: s.points }))}
            color={teamColor}
          />
          <SeasonHistoryTable seasons={seasons} />
        </div>
      </FadeIn>
    </div>
  )
}
