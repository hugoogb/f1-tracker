import Link from 'next/link'
import { api } from '@/lib/api'
import type { DriverStanding, ConstructorStanding, Race, SeasonChampion } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DriverStandingsTable } from '@/components/standings/driver-standings-table'
import { ConstructorStandingsTable } from '@/components/standings/constructor-standings-table'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'F1 Tracker',
  description:
    'Explore the complete history of Formula 1 with interactive analytics, standings, and race results from 1950 to today',
}

export default async function Home() {
  const [seasonsResponse, statsResult, championsResult] = await Promise.allSettled([
    api.seasons.list(),
    api.stats(),
    api.champions() as Promise<{ data: SeasonChampion[] }>,
  ])

  const seasons = seasonsResponse.status === 'fulfilled' ? seasonsResponse.value : null
  const stats = statsResult.status === 'fulfilled' ? statsResult.value : null
  const champions = championsResult.status === 'fulfilled' ? championsResult.value.data : []

  const latestYear = seasons?.data[0]?.year

  if (!latestYear) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center">
        <h1 className="text-4xl font-bold">F1 Tracker</h1>
        <p className="text-muted-foreground mt-4">No season data available yet.</p>
      </div>
    )
  }

  const [driverStandingsResponse, constructorStandingsResponse, seasonDetail] = await Promise.all([
    api.seasons.driverStandings(latestYear) as Promise<{
      year: number
      standings: DriverStanding[]
    }>,
    api.seasons.constructorStandings(latestYear) as Promise<{
      year: number
      standings: ConstructorStanding[]
    }>,
    api.seasons.get(latestYear) as Promise<{
      year: number
      races: Race[]
    }>,
  ])

  const driverStandings = driverStandingsResponse.standings ?? []
  const constructorStandings = constructorStandingsResponse.standings ?? []
  const races = seasonDetail.races ?? []
  const recentChampions = champions.slice(0, 5)

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold tracking-tight">Formula 1 {latestYear} Season</h1>

      {stats && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <StatCard label="Seasons" value={stats.seasons} href="/seasons" />
          <StatCard label="Drivers" value={stats.drivers} href="/drivers" />
          <StatCard label="Constructors" value={stats.constructors} href="/constructors" />
          <StatCard label="Circuits" value={stats.circuits} href="/circuits" />
          <StatCard label="Races" value={stats.races} />
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Driver Standings</CardTitle>
          </CardHeader>
          <CardContent>
            {driverStandings.length > 0 ? (
              <DriverStandingsTable standings={driverStandings} limit={10} />
            ) : (
              <p className="text-muted-foreground text-sm">
                Standings data has not been loaded yet.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Constructor Standings</CardTitle>
          </CardHeader>
          <CardContent>
            {constructorStandings.length > 0 ? (
              <ConstructorStandingsTable standings={constructorStandings} limit={10} />
            ) : (
              <p className="text-muted-foreground text-sm">
                Standings data has not been loaded yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {recentChampions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Champions</CardTitle>
          </CardHeader>
          <CardContent>
            <Table aria-label="Recent champions">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Year</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Constructor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentChampions.map((c) => (
                  <TableRow key={c.year}>
                    <TableCell className="font-medium">
                      <Link href={`/seasons/${c.year}`} className="hover:underline">
                        {c.year}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/drivers/${c.driver.ref}`} className="hover:underline">
                        {c.driver.firstName} {c.driver.lastName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {c.constructor ? (
                        <Link
                          href={`/constructors/${c.constructor.ref}`}
                          className="inline-flex items-center gap-2 hover:underline"
                        >
                          {c.constructor.color && (
                            <span
                              className="inline-block size-3 rounded-full"
                              style={{ backgroundColor: c.constructor.color }}
                            />
                          )}
                          {c.constructor.name}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Race Calendar</CardTitle>
        </CardHeader>
        <CardContent>
          {races.length > 0 ? (
            <Table aria-label="Race calendar">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Round</TableHead>
                  <TableHead>Race</TableHead>
                  <TableHead>Circuit</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead className="text-right">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {races.map((race) => (
                  <TableRow key={race.id}>
                    <TableCell className="font-medium">{race.round}</TableCell>
                    <TableCell>
                      <Link
                        href={`/seasons/${latestYear}/races/${race.round}`}
                        className="hover:underline"
                      >
                        {race.name}
                      </Link>
                    </TableCell>
                    <TableCell>{race.circuit.name}</TableCell>
                    <TableCell>{race.circuit.country}</TableCell>
                    <TableCell className="text-right">
                      {new Date(race.date).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground text-sm">No races found for this season.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({ label, value, href }: { label: string; value: number; href?: string }) {
  const content = (
    <Card className={href ? 'hover:bg-accent/50 transition-colors' : ''}>
      <CardContent className="pt-2">
        <p className="text-2xl font-bold tabular-nums">{value.toLocaleString()}</p>
        <p className="text-muted-foreground text-sm">{label}</p>
      </CardContent>
    </Card>
  )

  if (href) {
    return <Link href={href}>{content}</Link>
  }
  return content
}
