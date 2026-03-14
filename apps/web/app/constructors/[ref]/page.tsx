import Link from 'next/link'
import { api } from '@/lib/api'
import type { Constructor, ConstructorSeasonSummary, Driver } from '@/lib/types'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { ConstructorSeasonHistoryTable } from '@/components/constructors/season-history-table'
import { CareerPointsChart } from '@/components/charts/career-points-chart'
import { TEAM_COLORS } from '@/lib/constants'

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

  return (
    <div className="space-y-8">
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: 'Constructors', href: '/constructors' },
          { label: constructor.name },
        ]}
      />
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          {constructor.color && (
            <span
              className="inline-block size-5 rounded-full"
              style={{ backgroundColor: constructor.color }}
            />
          )}
          <h1>{constructor.name}</h1>
        </div>
        {constructor.nationality && (
          <p className="text-muted-foreground">{constructor.nationality}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Entries" value={constructor.stats.total_entries} />
        <StatCard label="Wins" value={constructor.stats.wins} />
        <StatCard label="Podiums" value={constructor.stats.podiums} />
        <StatCard label="Points" value={constructor.stats.total_points} />
      </div>

      {roster && roster.year && roster.drivers.length > 0 && (
        <div>
          <h2 className="mb-4">Drivers ({roster.year})</h2>
          <div className="flex flex-wrap gap-3">
            {roster.drivers.map((d) => (
              <Link key={d.ref} href={`/drivers/${d.ref}`}>
                <Badge variant="secondary" className="hover:bg-accent px-3 py-1.5 text-sm">
                  {d.code && (
                    <span className="text-muted-foreground mr-1 font-mono text-xs">{d.code}</span>
                  )}
                  {d.firstName} {d.lastName}
                </Badge>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-4">Season History</h2>
        <CareerPointsChart
          seasons={seasons.map((s) => ({ year: s.year, points: s.points }))}
          color={TEAM_COLORS[constructor.ref] ?? constructor.color ?? '#E8002D'}
        />
        <ConstructorSeasonHistoryTable seasons={seasons} />
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="pt-2">
        <p className="text-primary text-3xl font-bold tabular-nums">
          {typeof value === 'number' && !Number.isInteger(value)
            ? value.toLocaleString('en-US', { maximumFractionDigits: 1 })
            : value.toLocaleString('en-US')}
        </p>
        <p className="text-muted-foreground text-sm font-medium">{label}</p>
      </CardContent>
    </Card>
  )
}
