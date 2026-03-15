import Link from 'next/link'
import { notFound } from 'next/navigation'
import { MapPin, Calendar } from 'lucide-react'
import { api } from '@/lib/api'
import type { Circuit, CircuitLayout, CircuitLapRecord, CircuitStats } from '@/lib/types'
import { CountryFlag } from '@/components/ui/country-flag'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { Card, CardContent } from '@/components/ui/card'
import { StatCard } from '@/components/ui/stat-card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { TrackLayout } from '@/components/circuits/track-layout'
import { CircuitStatsView } from '@/components/circuits/circuit-stats'
import { FadeIn, StaggerList, StaggerItem } from '@/components/ui/motion'

export const dynamic = 'force-dynamic'

interface CircuitRace {
  id: string
  seasonYear: number
  round: number
  name: string
  date: string | null
}

interface CircuitDetail extends Circuit {
  lapRecord: CircuitLapRecord | null
  layouts: CircuitLayout[]
  races: CircuitRace[]
}

export async function generateMetadata({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params
  const circuit = (await api.circuits.get(ref)) as CircuitDetail
  return {
    title: `${circuit.name} | F1 Tracker`,
    description: `Race history at ${circuit.name}, ${circuit.location}, ${circuit.country}`,
  }
}

export default async function CircuitDetailPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params

  const [circuitResult, statsResult] = await Promise.allSettled([
    api.circuits.get(ref) as Promise<CircuitDetail>,
    api.circuits.stats(ref) as Promise<CircuitStats>,
  ])

  if (circuitResult.status === 'rejected') notFound()
  const circuit = circuitResult.value
  const circuitStats = statsResult.status === 'fulfilled' ? statsResult.value : null

  const firstRaceYear =
    circuit.races.length > 0 ? circuit.races[circuit.races.length - 1]?.seasonYear : null
  const lastRaceYear = circuit.races.length > 0 ? circuit.races[0]?.seasonYear : null
  // Group races by decade
  const racesByDecade = circuit.races.reduce<Record<string, CircuitRace[]>>((acc, race) => {
    const decade = `${Math.floor(race.seasonYear / 10) * 10}s`
    ;(acc[decade] ??= []).push(race)
    return acc
  }, {})

  const decades = Object.keys(racesByDecade).sort((a, b) => parseInt(b) - parseInt(a))

  return (
    <div className="space-y-8">
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: 'Circuits', href: '/circuits' },
          { label: circuit.name },
        ]}
      />

      <FadeIn>
        <div className="space-y-4">
          <h1 className="text-gradient">{circuit.name}</h1>
          <div className="glass rounded-xl px-5 py-4">
            <p className="text-foreground flex items-center gap-2 font-medium">
              <MapPin className="text-primary h-4 w-4" />
              {circuit.country && <CountryFlag code={circuit.countryCode} />}
              {circuit.location}, {circuit.country}
            </p>
          </div>
          <div className="accent-line" />
        </div>
      </FadeIn>

      {/* Track Layout */}
      {circuit.layouts.length > 0 && (
        <FadeIn>
          <TrackLayout layouts={circuit.layouts} name={circuit.name} />
        </FadeIn>
      )}

      {/* Stats row */}
      <StaggerList className="grid grid-cols-3 gap-4">
        <StaggerItem>
          <StatCard label="Total Races" value={circuit.races.length} icon={Calendar} />
        </StaggerItem>
        {firstRaceYear && (
          <StaggerItem>
            <StatCard label="First Race" value={firstRaceYear} />
          </StaggerItem>
        )}
        {lastRaceYear && (
          <StaggerItem>
            <StatCard label="Latest Race" value={lastRaceYear} />
          </StaggerItem>
        )}
      </StaggerList>

      {/* Lap Record */}
      {circuit.lapRecord && (
        <FadeIn>
          <Card className="border border-purple-500/30 bg-purple-500/5">
            <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
              <p className="text-xs font-medium tracking-wider text-purple-400 uppercase">
                Lap Record
              </p>
              <div className="flex items-center gap-2">
                {circuit.lapRecord.constructor?.color && (
                  <span
                    className="inline-block h-3 w-1 rounded-full"
                    style={{ backgroundColor: circuit.lapRecord.constructor.color }}
                  />
                )}
                <Link
                  href={`/drivers/${circuit.lapRecord.driver.ref}`}
                  className="hover:text-primary text-sm font-semibold transition-colors"
                >
                  {circuit.lapRecord.driver.firstName} {circuit.lapRecord.driver.lastName}
                </Link>
              </div>
              <span className="font-mono text-sm text-purple-300">{circuit.lapRecord.time}</span>
              <span className="text-muted-foreground text-xs">
                {circuit.lapRecord.year}
                {circuit.lapRecord.speed && ` · ${circuit.lapRecord.speed} km/h`}
              </span>
            </CardContent>
          </Card>
        </FadeIn>
      )}

      {/* Circuit Performance Stats */}
      {circuitStats && (circuitStats.mostWins.length > 0 || circuitStats.mostPoles.length > 0) && (
        <FadeIn>
          <div className="space-y-4">
            <h2>Circuit Stats</h2>
            <div className="accent-line" />
            <CircuitStatsView stats={circuitStats} />
          </div>
        </FadeIn>
      )}

      {/* Race history grouped by decade */}
      <div className="space-y-6">
        <h2>Race History</h2>
        {circuit.races.length === 0 ? (
          <p className="text-muted-foreground text-sm">No race data available.</p>
        ) : (
          decades.map((decade, i) => (
            <FadeIn key={decade} delay={Math.min(i * 0.05, 0.2)}>
              <div className="space-y-3">
                <div>
                  <h3 className="text-muted-foreground mb-2 text-sm font-medium tracking-wider uppercase">
                    {decade}
                  </h3>
                  <div className="accent-line" />
                </div>
                <Table aria-label={`Race history ${decade}`}>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">Year</TableHead>
                      <TableHead className="hidden w-16 sm:table-cell">Round</TableHead>
                      <TableHead>Race</TableHead>
                      <TableHead className="text-right">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {racesByDecade[decade].map((race) => (
                      <TableRow key={race.id}>
                        <TableCell>
                          <Link
                            href={`/seasons/${race.seasonYear}`}
                            className="hover:text-primary transition-colors"
                          >
                            {race.seasonYear}
                          </Link>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <Badge variant="outline" className="font-mono text-xs">
                            R{race.round}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/seasons/${race.seasonYear}/races/${race.round}`}
                            className="hover:text-primary transition-colors"
                          >
                            {race.name}
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-right whitespace-nowrap">
                          {race.date
                            ? new Date(race.date).toLocaleDateString('en-GB', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })
                            : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </FadeIn>
          ))
        )}
      </div>
    </div>
  )
}
