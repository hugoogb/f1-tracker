import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Flag, Trophy, Medal, TrendingUp } from 'lucide-react'
import { api, isNotFound } from '@/lib/api'
import type { Constructor, ConstructorSeasonSummary, Driver } from '@/lib/types'
import { teamColorOf } from '@/lib/utils'
import { CountryFlag } from '@/components/ui/country-flag'
import { DriverAvatar } from '@/components/ui/driver-avatar'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { Card, CardContent } from '@/components/ui/card'
import { StatCard } from '@/components/ui/stat-card'
import { ConstructorSeasonHistoryTable } from '@/components/constructors/season-history-table'
import { CareerPointsChart } from '@/components/charts/career-points-chart'
import { FadeIn, StaggerList, StaggerItem, MotionCard } from '@/components/ui/motion'
import { JsonLd } from '@/components/seo/json-ld'
import { organizationSchema } from '@/lib/structured-data'
import { buildMetadata, SITE_DESCRIPTION } from '@/lib/seo'

interface ConstructorDetail extends Constructor {
  stats: {
    total_entries: number
    wins: number
    podiums: number
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
  let constructor: ConstructorDetail
  try {
    constructor = (await api.constructors.get(ref)) as ConstructorDetail
  } catch {
    // The page itself decides between 404 and error; metadata must not throw.
    // Streaming means the 404 body still ships with a 200, so noindex is what
    // actually keeps a missing resource out of the index.
    return buildMetadata({
      title: 'Constructor',
      description: SITE_DESCRIPTION,
      path: `/constructors/${ref}`,
      noindex: true,
    })
  }

  const { total_entries: entries, wins, podiums, total_points: points } = constructor.stats
  return buildMetadata({
    title: constructor.name,
    description:
      `${constructor.name}'s complete Formula 1 record: ${entries} race entries, ${wins} wins, ` +
      `${podiums} podiums and ${points} championship points, season by season with the full driver roster.`,
    path: `/constructors/${ref}`,
  })
}

export default async function ConstructorDetailPage({
  params,
}: {
  params: Promise<{ ref: string }>
}) {
  const { ref } = await params

  const [constructorResult, seasonsResult, rosterResult] = await Promise.allSettled([
    api.constructors.get(ref) as Promise<ConstructorDetail>,
    api.constructors.seasons(ref) as Promise<{ seasons: ConstructorSeasonSummary[] }>,
    api.constructors.roster(ref) as Promise<{ year: number | null; drivers: Driver[] }>,
  ])

  // An unknown ref must answer 404, not 500 — but only when the API actually
  // said the constructor is missing; an outage has to keep returning an error.
  if (constructorResult.status === 'rejected') {
    if (isNotFound(constructorResult.reason)) notFound()
    throw constructorResult.reason
  }
  const constructor = constructorResult.value
  const seasons = seasonsResult.status === 'fulfilled' ? seasonsResult.value.seasons : []
  const roster = rosterResult.status === 'fulfilled' ? rosterResult.value : null

  const teamColor = teamColorOf(constructor.color, '#E8002D')!

  return (
    <div className="space-y-8">
      <JsonLd
        data={organizationSchema({
          name: constructor.name,
          path: `/constructors/${ref}`,
          nationality: constructor.nationality,
        })}
      />
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: 'Constructors', href: '/constructors' },
          { label: constructor.name },
        ]}
      />

      {/* Team-branded header */}
      <FadeIn>
        <div className="space-y-3">
          <div className="h-1 w-24 rounded-full" style={{ backgroundColor: teamColor }} />
          <div className="flex items-center gap-4">
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-lg font-bold text-white"
              style={{
                backgroundColor: teamColor,
                boxShadow: `0 0 30px ${teamColor}40`,
              }}
            >
              {constructor.name[0]}
            </div>
            <div>
              <h1>{constructor.name}</h1>
              {constructor.nationality && (
                <p className="text-muted-foreground inline-flex items-center gap-1.5">
                  <CountryFlag code={constructor.countryCode} />
                  {constructor.nationality}
                </p>
              )}
            </div>
          </div>
        </div>
      </FadeIn>

      <div className="accent-line" />

      <StaggerList className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StaggerItem>
          <StatCard
            label="Races"
            value={constructor.stats.total_entries}
            icon={Flag}
            color={teamColor}
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Wins" value={constructor.stats.wins} icon={Trophy} color={teamColor} />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label="Podiums"
            value={constructor.stats.podiums}
            icon={Medal}
            color={teamColor}
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label="Points"
            value={constructor.stats.total_points}
            icon={TrendingUp}
            color={teamColor}
          />
        </StaggerItem>
      </StaggerList>

      {roster && roster.year && roster.drivers.length > 0 && (
        <FadeIn>
          <div>
            <h2 className="mb-4">Drivers ({roster.year})</h2>
            <StaggerList className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              {roster.drivers.map((d) => (
                <StaggerItem key={d.ref}>
                  <Link href={`/drivers/${d.ref}`}>
                    <MotionCard>
                      <Card className="hover:border-primary/30 transition-all duration-200">
                        <CardContent className="flex items-center gap-3 px-4 py-3">
                          <DriverAvatar
                            firstName={d.firstName}
                            lastName={d.lastName}
                            size="md"
                            teamColor={teamColor}
                          />
                          <div>
                            <p className="text-sm font-medium">
                              {d.firstName} {d.lastName}
                            </p>
                            <div className="text-muted-foreground flex items-center gap-2 text-xs">
                              {d.code && <span className="font-mono">{d.code}</span>}
                              {d.nationality && (
                                <span className="inline-flex items-center gap-1">
                                  <CountryFlag code={d.countryCode} size={12} />
                                  {d.nationality}
                                </span>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </MotionCard>
                  </Link>
                </StaggerItem>
              ))}
            </StaggerList>
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
          <ConstructorSeasonHistoryTable seasons={seasons} />
        </div>
      </FadeIn>
    </div>
  )
}
