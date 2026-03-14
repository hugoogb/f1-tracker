import Link from 'next/link'
import { redirect } from 'next/navigation'
import { api } from '@/lib/api'
import type { Driver } from '@/lib/types'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ComparisonChart } from '@/components/charts/comparison-chart'

export const dynamic = 'force-dynamic'

interface DriverStats {
  total_races: number
  wins: number
  podiums: number
  total_points: number
}

interface CompareResponse {
  driver1: Driver & { stats: DriverStats }
  driver2: Driver & { stats: DriverStats }
  headToHead: {
    driver1Wins: number
    driver2Wins: number
    totalRaces: number
  }
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
  searchParams: Promise<{ d1?: string; d2?: string }>
}) {
  const params = await searchParams
  if (!params.d1 || !params.d2) redirect('/compare')

  let data: CompareResponse
  try {
    data = (await api.compare.drivers(params.d1, params.d2)) as CompareResponse
  } catch {
    redirect('/compare')
  }

  const { driver1, driver2, headToHead, driver1Seasons, driver2Seasons } = data
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

      <h1>
        <Link href={`/drivers/${driver1.ref}`} className="hover:text-primary transition-colors">
          {d1Name}
        </Link>
        {' vs '}
        <Link href={`/drivers/${driver2.ref}`} className="hover:text-primary transition-colors">
          {d2Name}
        </Link>
      </h1>

      {/* Head to Head */}
      <Card>
        <CardHeader>
          <CardTitle>Head to Head</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex-1 text-right">
              <p className="text-primary text-3xl font-bold tabular-nums">
                {headToHead.driver1Wins}
              </p>
              <p className="text-muted-foreground text-sm font-medium">{driver1.lastName}</p>
            </div>
            <div className="flex flex-col items-center">
              <p className="text-muted-foreground text-sm">from</p>
              <p className="text-lg font-semibold">{headToHead.totalRaces}</p>
              <p className="text-muted-foreground text-sm">shared races</p>
            </div>
            <div className="flex-1">
              <p className="text-3xl font-bold text-blue-500 tabular-nums">
                {headToHead.driver2Wins}
              </p>
              <p className="text-muted-foreground text-sm font-medium">{driver2.lastName}</p>
            </div>
          </div>
          {headToHead.totalRaces > 0 && (
            <div className="bg-muted mt-4 flex h-3 overflow-hidden rounded-full">
              <div
                className="bg-primary rounded-l-full transition-all duration-500"
                style={{
                  width: `${(headToHead.driver1Wins / headToHead.totalRaces) * 100}%`,
                }}
              />
              <div
                className="rounded-r-full bg-blue-500 transition-all duration-500"
                style={{
                  width: `${(headToHead.driver2Wins / headToHead.totalRaces) * 100}%`,
                }}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats Comparison */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <Link
                href={`/drivers/${driver1.ref}`}
                className="hover:text-primary transition-colors"
              >
                {d1Name}
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <StatItem label="Races" value={driver1.stats.total_races} />
              <StatItem label="Wins" value={driver1.stats.wins} />
              <StatItem label="Podiums" value={driver1.stats.podiums} />
              <StatItem label="Points" value={driver1.stats.total_points} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <Link
                href={`/drivers/${driver2.ref}`}
                className="hover:text-primary transition-colors"
              >
                {d2Name}
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <StatItem label="Races" value={driver2.stats.total_races} />
              <StatItem label="Wins" value={driver2.stats.wins} />
              <StatItem label="Podiums" value={driver2.stats.podiums} />
              <StatItem label="Points" value={driver2.stats.total_points} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Career Points Chart */}
      {(driver1Seasons.length > 0 || driver2Seasons.length > 0) && (
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
      )}
    </div>
  )
}

function StatItem({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-primary text-2xl font-bold tabular-nums">
        {typeof value === 'number' && !Number.isInteger(value)
          ? value.toLocaleString('en-US', { maximumFractionDigits: 1 })
          : value.toLocaleString('en-US')}
      </p>
      <p className="text-muted-foreground text-sm font-medium">{label}</p>
    </div>
  )
}
