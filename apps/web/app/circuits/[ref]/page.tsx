import Link from 'next/link'
import { ExternalLink, MapPin, Calendar } from 'lucide-react'
import { api } from '@/lib/api'
import type { Circuit } from '@/lib/types'
import { COUNTRY_FLAGS } from '@/lib/constants'
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

      <div className="space-y-2">
        <h1>{circuit.name}</h1>
        <p className="text-muted-foreground text-lg">
          {flag && <span className="mr-1.5">{flag}</span>}
          {circuit.location}, {circuit.country}
        </p>
        {circuit.latitude != null && circuit.longitude != null && (
          <a
            href={`https://www.openstreetmap.org/?mlat=${circuit.latitude}&mlon=${circuit.longitude}#map=15/${circuit.latitude}/${circuit.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="border-border bg-background hover:bg-muted inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm font-medium transition-all"
          >
            <MapPin className="h-3.5 w-3.5" />
            View on Map
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

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
            <div key={decade}>
              <h3 className="text-muted-foreground mb-3 text-sm font-medium tracking-wider uppercase">
                {decade}
              </h3>
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
