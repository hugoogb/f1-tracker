import Link from 'next/link'
import { MapPin, Calendar } from 'lucide-react'
import { api } from '@/lib/api'
import type { Circuit } from '@/lib/types'
import { COUNTRY_FLAGS } from '@/lib/constants'
import { getTrackLayout } from '@/lib/track-data'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
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

export const dynamic = 'force-dynamic'

interface CircuitRace {
  id: string
  seasonYear: number
  round: number
  name: string
  date: string | null
}

interface CircuitDetail extends Circuit {
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
  const circuit = (await api.circuits.get(ref)) as CircuitDetail

  const flag = circuit.country ? COUNTRY_FLAGS[circuit.country] : null
  const firstRaceYear =
    circuit.races.length > 0 ? circuit.races[circuit.races.length - 1]?.seasonYear : null
  const lastRaceYear = circuit.races.length > 0 ? circuit.races[0]?.seasonYear : null
  const trackCoords = getTrackLayout(circuit.ref)

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

      <div className="space-y-4">
        <h1 className="text-gradient">{circuit.name}</h1>
        <div className="glass rounded-xl px-5 py-4">
          <p className="text-foreground flex items-center gap-2 font-medium">
            <MapPin className="text-primary h-4 w-4" />
            {flag && <span>{flag}</span>}
            {circuit.location}, {circuit.country}
          </p>
        </div>
        <div className="accent-line" />
      </div>

      {/* Track Layout */}
      {trackCoords && <TrackLayout coordinates={trackCoords} name={circuit.name} />}

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total Races" value={circuit.races.length} icon={Calendar} />
        {firstRaceYear && <StatCard label="First Race" value={firstRaceYear} />}
        {lastRaceYear && <StatCard label="Latest Race" value={lastRaceYear} />}
      </div>

      {/* Race history grouped by decade */}
      <div className="space-y-6">
        <h2>Race History</h2>
        {circuit.races.length === 0 ? (
          <p className="text-muted-foreground text-sm">No race data available.</p>
        ) : (
          decades.map((decade) => (
            <div key={decade} className="space-y-3">
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
          ))
        )}
      </div>
    </div>
  )
}
