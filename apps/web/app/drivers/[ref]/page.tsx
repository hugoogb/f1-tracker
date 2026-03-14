import { api } from '@/lib/api'
import type { Driver, DriverSeasonSummary } from '@/lib/types'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { SeasonHistoryTable } from '@/components/drivers/season-history-table'
import { CareerPointsChart } from '@/components/charts/career-points-chart'

export const dynamic = 'force-dynamic'

interface DriverDetail extends Driver {
  stats: {
    total_races: number
    wins: number
    podiums: number
    total_points: number
  }
}

export async function generateMetadata({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params
  const driver = (await api.drivers.get(ref)) as DriverDetail
  return {
    title: `${driver.firstName} ${driver.lastName} | F1 Tracker`,
    description: `Career stats for ${driver.firstName} ${driver.lastName}`,
  }
}

export default async function DriverDetailPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params

  const [driver, seasonsResult] = await Promise.allSettled([
    api.drivers.get(ref) as Promise<DriverDetail>,
    api.drivers.seasons(ref) as Promise<{ seasons: DriverSeasonSummary[] }>,
  ])

  if (driver.status === 'rejected') throw new Error('Driver not found')
  const driverData = driver.value
  const seasons = seasonsResult.status === 'fulfilled' ? seasonsResult.value.seasons : []

  return (
    <div className="space-y-8">
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: 'Drivers', href: '/drivers' },
          { label: `${driverData.firstName} ${driverData.lastName}` },
        ]}
      />
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">
          {driverData.firstName} {driverData.lastName}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          {driverData.nationality && (
            <span className="text-muted-foreground">{driverData.nationality}</span>
          )}
          {driverData.dateOfBirth && (
            <span className="text-muted-foreground">
              Born{' '}
              {new Date(driverData.dateOfBirth).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </span>
          )}
          {driverData.number != null && <Badge variant="outline">#{driverData.number}</Badge>}
          {driverData.code && <Badge variant="secondary">{driverData.code}</Badge>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Races" value={driverData.stats.total_races} />
        <StatCard label="Wins" value={driverData.stats.wins} />
        <StatCard label="Podiums" value={driverData.stats.podiums} />
        <StatCard label="Points" value={driverData.stats.total_points} />
      </div>

      <div>
        <h2 className="mb-4 text-xl font-semibold">Season History</h2>
        <CareerPointsChart seasons={seasons.map((s) => ({ year: s.year, points: s.points }))} />
        <SeasonHistoryTable seasons={seasons} />
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="pt-2">
        <p className="text-3xl font-bold tabular-nums">
          {typeof value === 'number' && !Number.isInteger(value)
            ? value.toLocaleString('en-US', { maximumFractionDigits: 1 })
            : value.toLocaleString('en-US')}
        </p>
        <p className="text-muted-foreground text-sm">{label}</p>
      </CardContent>
    </Card>
  )
}
