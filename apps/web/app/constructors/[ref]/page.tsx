import Link from 'next/link'
import { Flag, Trophy, Medal, TrendingUp } from 'lucide-react'
import { api } from '@/lib/api'
import type { Constructor, ConstructorSeasonSummary, Driver } from '@/lib/types'
import { TEAM_COLORS } from '@/lib/constants'
import { CountryFlag } from '@/components/ui/country-flag'
import { DriverAvatar } from '@/components/ui/driver-avatar'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { Card, CardContent } from '@/components/ui/card'
import { StatCard } from '@/components/ui/stat-card'
import { ConstructorSeasonHistoryTable } from '@/components/constructors/season-history-table'
import { CareerPointsChart } from '@/components/charts/career-points-chart'
import { FadeIn, StaggerList, StaggerItem, MotionCard } from '@/components/ui/motion'

export const dynamic = 'force-dynamic'

interface ConstructorDetail extends Constructor {
  stats: {
    total_entries: number
    wins: number
    podiums: number
    total_points: number
  }
}

export async function generateMetadata({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params
  const constructor = (await api.constructors.get(ref)) as ConstructorDetail
  return {
    title: `${constructor.name} | F1 Tracker`,
    description: `Career stats for ${constructor.name}`,
  }
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

  if (constructorResult.status === 'rejected') throw new Error('Constructor not found')
  const constructor = constructorResult.value
  const seasons = seasonsResult.status === 'fulfilled' ? seasonsResult.value.seasons : []
  const roster = rosterResult.status === 'fulfilled' ? rosterResult.value : null

  const teamColor = TEAM_COLORS[constructor.ref] ?? constructor.color ?? '#E8002D'

  return (
    <div className="space-y-8">
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
                            headshotUrl={d.headshotUrl}
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
