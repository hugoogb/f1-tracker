import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Flag, Trophy, Medal, TrendingUp, GitCompareArrows, Timer, Zap, Award } from 'lucide-react'
import { api, isNotFound } from '@/lib/api'
import type { Driver, DriverSeasonSummary, DriverPaceResponse } from '@/lib/types'
import { latestTeamColor, liveryStyle } from '@/lib/livery'
import { CountryFlag } from '@/components/ui/country-flag'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { StatCard } from '@/components/ui/stat-card'
import { SeasonHistoryTable } from '@/components/drivers/season-history-table'
import { CareerPointsChart } from '@/components/charts/career-points-chart'
import { QualiVsRaceChart } from '@/components/charts/quali-vs-race-chart'
import { FadeIn, StaggerList, StaggerItem } from '@/components/ui/motion'
import { JsonLd } from '@/components/seo/json-ld'
import { personSchema } from '@/lib/structured-data'
import { buildMetadata, SITE_DESCRIPTION } from '@/lib/seo'
import { LocalDate } from '@/components/ui/local-date'
import { FavouriteButton } from '@/components/favourites/favourite-button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Meter } from '@/components/ui/meter'
import { Panel } from '@/components/ui/panel'
import { PageHero } from '@/components/ui/page-hero'
import { Tag } from '@/components/ui/tag'
import { compareHref } from '@/lib/compare-prefill'
import { RecordVisit } from '@/components/layout/record-visit'
import { WhereNext } from '@/components/layout/where-next'

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
    image: `/drivers/${ref}/opengraph-image`,
    imageAlt: `${name} — Formula 1 career record`,
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

  // The livery is the most recent team's colour, or the default red (owner's call).
  const latestSeason = seasons.reduce<(typeof seasons)[number] | undefined>(
    (a, b) => (!a || b.year > a.year ? b : a),
    undefined,
  )
  const latestTeam = latestSeason?.constructor
  const teamColor = latestTeamColor(seasons) ?? undefined
  const fullName = `${driverData.firstName} ${driverData.lastName}`

  return (
    <div className="space-y-8" style={liveryStyle(teamColor)}>
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

      <RecordVisit
        href={`/drivers/${ref}`}
        label={fullName}
        kind="driver"
        color={teamColor ?? null}
      />
      <PageHero
        livery={teamColor}
        watermark={driverData.number != null ? String(driverData.number) : undefined}
        eyebrow={latestTeam ? `Driver · ${latestTeam.name}` : 'Driver'}
        title={
          <>
            {driverData.firstName} <span className="text-accent-livery">{driverData.lastName}</span>
          </>
        }
        tags={
          <>
            {driverData.code && <Tag variant="livery">{driverData.code}</Tag>}
            {driverData.number != null && <Tag variant="outline">#{driverData.number}</Tag>}
            {driverData.nationality && (
              <span className="text-muted-foreground inline-flex items-center gap-1.5 text-sm">
                <CountryFlag code={driverData.countryCode} />
                {driverData.nationality}
              </span>
            )}
            {driverData.dateOfBirth && (
              <span className="text-muted-foreground text-sm">
                Born <LocalDate value={driverData.dateOfBirth} style="long" />
              </span>
            )}
          </>
        }
        actions={
          <>
            <FavouriteButton
              type="driver"
              entityRef={ref}
              name={fullName}
              detail={driverData.nationality}
              countryCode={driverData.countryCode}
              size="icon"
            />
            <Link
              href={compareHref('driver', ref, fullName)}
              className={buttonVariants({ variant: 'livery', size: 'lg' })}
            >
              <GitCompareArrows className="size-3.5" aria-hidden />
              Compare
            </Link>
          </>
        }
      />

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

      {driverData.stats.total_races > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Panel size="sm" className="gap-2 px-4">
            <div className="flex items-baseline justify-between">
              <span className="label">Win rate</span>
              <span className="font-data text-sm">
                {Math.round((driverData.stats.wins / driverData.stats.total_races) * 100)}%
              </span>
            </div>
            <Meter
              value={driverData.stats.wins}
              max={driverData.stats.total_races}
              label="Win rate"
            />
          </Panel>
          <Panel size="sm" className="gap-2 px-4">
            <div className="flex items-baseline justify-between">
              <span className="label">Podium rate</span>
              <span className="font-data text-sm">
                {Math.round((driverData.stats.podiums / driverData.stats.total_races) * 100)}%
              </span>
            </div>
            <Meter
              value={driverData.stats.podiums}
              max={driverData.stats.total_races}
              label="Podium rate"
            />
          </Panel>
        </div>
      )}

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

      <WhereNext
        links={[
          {
            label: 'Compare head to head',
            href: compareHref('driver', ref, fullName),
            description: `${driverData.lastName} against any driver in history`,
          },
          ...(latestSeason
            ? [
                {
                  label: `${latestSeason.year} in-season comparison`,
                  href: `/seasons/${latestSeason.year}/compare?type=drivers&a=${ref}`,
                  description: 'Round by round against a rival that year',
                },
                {
                  label: `${latestSeason.year} season`,
                  href: `/seasons/${latestSeason.year}`,
                  description: 'Standings, calendar and results',
                },
              ]
            : []),
        ]}
      />
    </div>
  )
}
