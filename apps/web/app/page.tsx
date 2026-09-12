import Link from 'next/link'
import { Calendar, Users, Building2, MapPin, Flag, Trophy } from 'lucide-react'
import { api } from '@/lib/api'
import type { DriverStanding, ConstructorStanding, Race, SeasonChampion } from '@/lib/types'
import { raceStart } from '@/lib/schedule'
import { cn } from '@/lib/utils'
import { LocalDate, LocalDateTime } from '@/components/ui/local-date'
import { CountryFlag } from '@/components/ui/country-flag'
import { DriverAvatar } from '@/components/ui/driver-avatar'
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
import { FadeIn, StaggerList, StaggerItem, HeroGlow } from '@/components/ui/motion'
import { NextRaceCountdown } from '@/components/ui/next-race-countdown'
import type { Metadata } from 'next'
import { SITE_DESCRIPTION, SITE_NAME, absoluteUrl } from '@/lib/seo'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  // `absolute` opts out of the root layout's `%s | F1 Tracker` template, which
  // would otherwise render as "F1 Tracker | F1 Tracker".
  title: { absolute: `${SITE_NAME} — Formula 1 history, stats and analytics` },
  description: SITE_DESCRIPTION,
  alternates: { canonical: absoluteUrl('/') },
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

  // Settled, not all: a season whose calendar is published before its first
  // race has no standings yet, and that must not take the whole page down.
  const [driverStandingsResponse, constructorStandingsResponse, seasonDetail] =
    await Promise.allSettled([
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

  const driverStandings =
    driverStandingsResponse.status === 'fulfilled'
      ? (driverStandingsResponse.value.standings ?? [])
      : []
  const constructorStandings =
    constructorStandingsResponse.status === 'fulfilled'
      ? (constructorStandingsResponse.value.standings ?? [])
      : []
  const races = seasonDetail.status === 'fulfilled' ? (seasonDetail.value.races ?? []) : []
  const recentChampions = champions.slice(0, 5)

  // This is a server component rendered per request (`force-dynamic`), so
  // reading the clock here is the point — the lint rule is aimed at client
  // components, where an impure read would drift between renders.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  // A race counts as done once its start time has passed. Seasons f1db does not
  // schedule fall back to the calendar date, which is midnight UTC — close
  // enough to place a race on one side of "now" or the other.
  const startOf = (race: Race) => Date.parse(raceStart(race))
  const nextRace = races.find((r) => startOf(r) > now) ?? null
  const lastRace = [...races].reverse().find((r) => startOf(r) <= now) ?? null
  const roundsRun = races.filter((r) => startOf(r) <= now).length
  const leader = driverStandings[0]
  const runnerUp = driverStandings[1]
  const leadGap =
    leader && runnerUp ? Math.round((leader.points - runnerUp.points) * 10) / 10 : null

  return (
    <div className="space-y-10">
      {/* Hero Section */}
      <div className="relative mx-[-1.5rem] overflow-hidden md:mx-[-2rem]">
        {/* Radial glow overlay - breathing animation */}
        <HeroGlow className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,oklch(0.55_0.25_27/8%)_0%,transparent_70%)]" />
        <div className="from-primary/5 via-background to-background relative bg-gradient-to-b px-6 py-16 md:px-8 md:py-20">
          <div className="mx-auto max-w-[1400px] space-y-4">
            <FadeIn y={12}>
              <p className="text-muted-foreground text-sm font-medium tracking-widest uppercase">
                Complete History & Analytics
              </p>
            </FadeIn>
            <FadeIn delay={0.1} y={12}>
              <h1>
                <span className="text-gradient">Formula 1</span>{' '}
                <span className="text-foreground">{latestYear}</span>
              </h1>
            </FadeIn>
            <FadeIn delay={0.2} y={12}>
              <p className="text-muted-foreground max-w-xl text-lg">
                Explore every season, driver, constructor, and circuit from 1950 to today.
              </p>
            </FadeIn>
            {races.length > 0 && (
              <FadeIn delay={0.3} y={12}>
                <div className="text-muted-foreground flex flex-wrap items-center gap-x-5 gap-y-1 pt-1 text-sm">
                  <span className="text-foreground font-medium tabular-nums">
                    Round {Math.min(roundsRun + 1, races.length)} of {races.length}
                  </span>
                  {leader && (
                    <span>
                      Leading:{' '}
                      <Link
                        href={`/drivers/${leader.driver.ref}`}
                        className="text-foreground hover:text-primary font-medium transition-colors"
                      >
                        {leader.driver.firstName} {leader.driver.lastName}
                      </Link>
                      {leadGap !== null && leadGap > 0 && (
                        <span className="tabular-nums"> (+{leadGap})</span>
                      )}
                    </span>
                  )}
                  {lastRace && (
                    <span>
                      Last out:{' '}
                      <Link
                        href={`/seasons/${latestYear}/races/${lastRace.round}`}
                        className="text-foreground hover:text-primary font-medium transition-colors"
                      >
                        {lastRace.name}
                      </Link>
                    </span>
                  )}
                </div>
              </FadeIn>
            )}
          </div>
        </div>
        <div className="accent-line" />
      </div>

      {/* Next race weekend, with the whole session schedule */}
      {nextRace && (
        <FadeIn>
          <NextRaceCountdown race={nextRace} seasonYear={latestYear} />
        </FadeIn>
      )}

      {/* Stat Cards */}
      {stats && (
        <StaggerList className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          <StaggerItem>
            <StatCard label="Seasons" value={stats.seasons} icon={Calendar} href="/seasons" />
          </StaggerItem>
          <StaggerItem>
            <StatCard label="Drivers" value={stats.drivers} icon={Users} href="/drivers" />
          </StaggerItem>
          <StaggerItem>
            <StatCard
              label="Constructors"
              value={stats.constructors}
              icon={Building2}
              href="/constructors"
            />
          </StaggerItem>
          <StaggerItem>
            <StatCard label="Circuits" value={stats.circuits} icon={MapPin} href="/circuits" />
          </StaggerItem>
          <StaggerItem>
            <StatCard label="Races" value={stats.races} icon={Flag} />
          </StaggerItem>
        </StaggerList>
      )}

      {/* Current Standings */}
      <FadeIn>
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
      </FadeIn>

      {/* Recent Champions */}
      {recentChampions.length > 0 && (
        <FadeIn>
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
            <StaggerList className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {recentChampions.map((c, i) => (
                <StaggerItem key={c.year}>
                  <Card className={i === 0 ? 'border-primary/30 glow-red' : ''}>
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
                      <div className="flex items-center gap-2">
                        <DriverAvatar firstName={c.driver.firstName} lastName={c.driver.lastName} />
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
                </StaggerItem>
              ))}
            </StaggerList>
          </div>
        </FadeIn>
      )}

      {/* Race Calendar */}
      <FadeIn>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{latestYear} Race Calendar</CardTitle>
            <Link
              href={`/seasons/${latestYear}`}
              className="text-primary hover:text-primary/80 text-sm font-medium transition-colors"
            >
              Season detail &rarr;
            </Link>
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
                    const isPast = startOf(race) <= now
                    const isNext = race.id === nextRace?.id

                    return (
                      <TableRow
                        key={race.id}
                        className={cn(
                          isPast && 'opacity-60',
                          isNext && 'bg-primary/5 hover:bg-primary/10',
                        )}
                      >
                        <TableCell>
                          <Badge
                            variant={isNext ? 'default' : 'outline'}
                            className="font-mono text-xs"
                          >
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
                          <span className="inline-flex items-center gap-1.5">
                            {race.circuit.country && (
                              <CountryFlag code={race.circuit.countryCode} />
                            )}
                            {race.circuit.country}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-sm whitespace-nowrap tabular-nums">
                          {race.schedule?.race ? (
                            <LocalDateTime value={race.schedule.race} />
                          ) : (
                            <LocalDate value={race.date} />
                          )}
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
      </FadeIn>
    </div>
  )
}
