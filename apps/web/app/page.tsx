import Link from 'next/link'
import { Calendar, Users, Building2, MapPin, Flag, Trophy } from 'lucide-react'
import { api } from '@/lib/api'
import type { DriverStanding, ConstructorStanding, Race, SeasonChampion } from '@/lib/types'
import { COUNTRY_FLAGS } from '@/lib/constants'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { StatCard } from '@/components/ui/stat-card'
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

  const now = new Date()

  return (
    <div className="space-y-10">
      {/* Hero Section */}
      <div className="relative mx-[-1.5rem] overflow-hidden md:mx-[-2rem]">
        {/* Radial glow overlay */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,oklch(0.55_0.25_27/8%)_0%,transparent_70%)]" />
        <div className="from-primary/5 via-background to-background relative bg-gradient-to-b px-6 py-16 md:px-8 md:py-20">
          <div className="mx-auto max-w-[1400px] space-y-4">
            <p className="text-muted-foreground text-sm font-medium tracking-widest uppercase">
              Complete History & Analytics
            </p>
            <h1>
              <span className="text-gradient">Formula 1</span>{' '}
              <span className="text-foreground">{latestYear}</span>
            </h1>
            <p className="text-muted-foreground max-w-xl text-lg">
              Explore every season, driver, constructor, and circuit from 1950 to today.
            </p>
          </div>
        </div>
        <div className="accent-line" />
      </div>

      {/* Stat Cards */}
      {stats && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Seasons" value={stats.seasons} icon={Calendar} href="/seasons" />
          <StatCard label="Drivers" value={stats.drivers} icon={Users} href="/drivers" />
          <StatCard
            label="Constructors"
            value={stats.constructors}
            icon={Building2}
            href="/constructors"
          />
          <StatCard label="Circuits" value={stats.circuits} icon={MapPin} href="/circuits" />
          <StatCard label="Races" value={stats.races} icon={Flag} />
        </div>
      )}

      {/* Current Standings */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Driver Standings</CardTitle>
            <Link
              href={`/seasons/${latestYear}`}
              className="text-primary hover:text-primary/80 text-sm font-medium transition-colors"
            >
              View all &rarr;
            </Link>
          </CardHeader>
          <CardContent>
            {driverStandings.length > 0 ? (
              <DriverStandingsTable standings={driverStandings} limit={5} />
            ) : (
              <p className="text-muted-foreground text-sm">
                Standings data has not been loaded yet.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Constructor Standings</CardTitle>
            <Link
              href={`/seasons/${latestYear}`}
              className="text-primary hover:text-primary/80 text-sm font-medium transition-colors"
            >
              View all &rarr;
            </Link>
          </CardHeader>
          <CardContent>
            {constructorStandings.length > 0 ? (
              <ConstructorStandingsTable standings={constructorStandings} limit={5} />
            ) : (
              <p className="text-muted-foreground text-sm">
                Standings data has not been loaded yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Champions */}
      {recentChampions.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2>Recent Champions</h2>
            <Link
              href="/champions"
              className="text-primary hover:text-primary/80 text-sm font-medium transition-colors"
            >
              All champions &rarr;
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {recentChampions.map((c, i) => (
              <Card key={c.year} className={i === 0 ? 'border-primary/30 glow-red' : ''}>
                <CardContent className="space-y-2 px-5 pt-1">
                  <div className="flex items-center justify-between">
                    <Link
                      href={`/seasons/${c.year}`}
                      className="font-heading hover:text-primary text-lg font-bold transition-colors"
                    >
                      {c.year}
                    </Link>
                    <Trophy className="h-4 w-4 text-amber-500/60" />
                  </div>
                  <div>
                    <Link
                      href={`/drivers/${c.driver.ref}`}
                      className="hover:text-primary text-sm font-medium transition-colors"
                    >
                      {c.driver.firstName} {c.driver.lastName}
                    </Link>
                  </div>
                  {c.constructor && (
                    <div className="flex items-center gap-1.5">
                      {c.constructor.color && (
                        <span
                          className="inline-block size-2 rounded-full"
                          style={{ backgroundColor: c.constructor.color }}
                        />
                      )}
                      <Link
                        href={`/constructors/${c.constructor.ref}`}
                        className="text-muted-foreground hover:text-foreground text-xs transition-colors"
                      >
                        {c.constructor.name}
                      </Link>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Race Calendar */}
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
                  <TableHead className="hidden md:table-cell">Circuit</TableHead>
                  <TableHead className="hidden sm:table-cell">Country</TableHead>
                  <TableHead className="text-right">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {races.map((race) => {
                  const raceDate = new Date(race.date)
                  const isPast = raceDate < now
                  const flag = race.circuit.country ? COUNTRY_FLAGS[race.circuit.country] : null

                  return (
                    <TableRow key={race.id} className={isPast ? 'opacity-60' : ''}>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs">
                          R{race.round}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/seasons/${latestYear}/races/${race.round}`}
                          className="hover:text-primary font-medium transition-colors"
                        >
                          {race.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden md:table-cell">
                        {race.circuit.name}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {flag && <span className="mr-1.5">{flag}</span>}
                        {race.circuit.country}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {raceDate.toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </TableCell>
                    </TableRow>
                  )
                })}
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
