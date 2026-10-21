import Link from 'next/link'
import { notFound } from 'next/navigation'
import { MapPin, Calendar } from 'lucide-react'
import { api, isNotFound } from '@/lib/api'
import type { Circuit, CircuitLayout, CircuitLapRecord, CircuitStats } from '@/lib/types'
import { CountryFlag } from '@/components/ui/country-flag'
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
import { CircuitStatsView } from '@/components/circuits/circuit-stats'
import { FadeIn, StaggerList, StaggerItem } from '@/components/ui/motion'
import { JsonLd } from '@/components/seo/json-ld'
import { placeSchema } from '@/lib/structured-data'
import { buildMetadata, SITE_DESCRIPTION } from '@/lib/seo'
import { LocalDate } from '@/components/ui/local-date'
import { FavouriteButton } from '@/components/favourites/favourite-button'
import { PageHero } from '@/components/ui/page-hero'
import { FastestLapCard } from '@/components/races/fastest-lap-card'
import { RecordVisit } from '@/components/layout/record-visit'
import { WhereNext } from '@/components/layout/where-next'

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

/**
 * Nothing is prerendered at build time: there are thousands of these pages and
 * the set changes with the data, so a build should not have to walk it. The
 * empty list still opts the route into the full route cache — the first request
 * for a path renders it, everything after is served from the cache until the
 * `f1-data` tag is purged by an ingest.
 */
export function generateStaticParams() {
  return []
}

export async function generateMetadata({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params
  let circuit: CircuitDetail
  try {
    circuit = (await api.circuits.get(ref)) as CircuitDetail
  } catch {
    // The page itself decides between 404 and error; metadata must not throw.
    // Streaming means the 404 body still ships with a 200, so noindex is what
    // actually keeps a missing resource out of the index.
    return buildMetadata({
      title: 'Circuit',
      description: SITE_DESCRIPTION,
      path: `/circuits/${ref}`,
      noindex: true,
    })
  }

  const where = [circuit.location, circuit.country].filter(Boolean).join(', ')
  const years = circuit.races.map((race) => race.seasonYear)
  const first = years.length > 0 ? Math.min(...years) : null
  const last = years.length > 0 ? Math.max(...years) : null
  const span = first === null ? '' : first === last ? ` in ${first}` : ` from ${first} to ${last}`

  return buildMetadata({
    title: circuit.name,
    description:
      `${circuit.name}${where ? ` in ${where}` : ''} — track layout, lap record and every Formula 1 ` +
      `Grand Prix held there${span}, with the drivers and constructors that won them.`,
    path: `/circuits/${ref}`,
    image: `/circuits/${ref}/opengraph-image`,
    imageAlt: `${circuit.name}${where ? ` in ${where}` : ''} — Formula 1 race history`,
  })
}

export default async function CircuitDetailPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params

  const [circuitResult, statsResult] = await Promise.allSettled([
    api.circuits.get(ref) as Promise<CircuitDetail>,
    api.circuits.stats(ref) as Promise<CircuitStats>,
  ])

  // An unknown ref must answer 404 — but an API outage has to surface as an
  // error rather than telling crawlers the circuit does not exist.
  if (circuitResult.status === 'rejected') {
    if (isNotFound(circuitResult.reason)) notFound()
    throw circuitResult.reason
  }
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
      <JsonLd
        data={placeSchema({
          name: circuit.name,
          path: `/circuits/${ref}`,
          locality: circuit.location,
          country: circuit.country,
          latitude: circuit.latitude,
          longitude: circuit.longitude,
        })}
      />
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: 'Circuits', href: '/circuits' },
          { label: circuit.name },
        ]}
      />

      <RecordVisit href={`/circuits/${ref}`} label={circuit.name} kind="circuit" />
      <PageHero
        eyebrow="Circuit"
        title={circuit.name}
        tags={
          <span className="text-muted-foreground inline-flex items-center gap-1.5 text-sm">
            <MapPin className="text-primary size-4" aria-hidden />
            {circuit.country && <CountryFlag code={circuit.countryCode} />}
            {[circuit.location, circuit.country].filter(Boolean).join(', ')}
          </span>
        }
        actions={
          <FavouriteButton
            type="circuit"
            entityRef={ref}
            name={circuit.name}
            detail={circuit.location ?? circuit.country}
            countryCode={circuit.countryCode}
            size="icon"
          />
        }
      />

      {/* Track Layout */}
      {circuit.layouts.length > 0 && (
        <FadeIn>
          <TrackLayout layouts={circuit.layouts} name={circuit.name} />
        </FadeIn>
      )}

      {/* Stats row */}
      <StaggerList className="grid grid-cols-3 gap-4">
        <StaggerItem>
          <StatCard label="Races held" value={circuit.races.length} icon={Calendar} />
        </StaggerItem>
        {firstRaceYear && (
          <StaggerItem>
            <StatCard label="First race" value={String(firstRaceYear)} />
          </StaggerItem>
        )}
        {lastRaceYear && (
          <StaggerItem>
            <StatCard label="Latest race" value={String(lastRaceYear)} />
          </StaggerItem>
        )}
      </StaggerList>

      {/* Lap Record */}
      {circuit.lapRecord && (
        <FastestLapCard
          fastestLap={circuit.lapRecord}
          label="Lap record"
          detail={[
            String(circuit.lapRecord.year),
            circuit.lapRecord.speed && `${circuit.lapRecord.speed} km/h`,
          ]
            .filter(Boolean)
            .join(' · ')}
        />
      )}

      {/* Circuit Performance Stats */}
      {circuitStats && (circuitStats.mostWins.length > 0 || circuitStats.mostPoles.length > 0) && (
        <FadeIn>
          <div className="space-y-4">
            <h2>Circuit stats</h2>
            <CircuitStatsView stats={circuitStats} />
          </div>
        </FadeIn>
      )}

      {/* Race history grouped by decade */}
      <div className="space-y-6">
        <h2>Race history</h2>
        {circuit.races.length === 0 ? (
          <p className="text-muted-foreground text-sm">No race data available.</p>
        ) : (
          decades.map((decade, i) => (
            <FadeIn key={decade} delay={Math.min(i * 0.05, 0.2)}>
              <div className="space-y-3">
                <h3 className="label">{decade}</h3>
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
                          <Badge variant="outline">R{race.round}</Badge>
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/seasons/${race.seasonYear}/races/${race.round}`}
                            prefetch={false}
                            className="hover:text-primary transition-colors"
                          >
                            {race.name}
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-right whitespace-nowrap">
                          {race.date ? <LocalDate value={race.date} /> : '—'}
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
      {circuit.races[0] && (
        <WhereNext
          links={[
            {
              label: `${circuit.races[0].name} ${circuit.races[0].seasonYear}`,
              href: `/seasons/${circuit.races[0].seasonYear}/races/${circuit.races[0].round}`,
              description: 'The latest race here',
            },
            {
              label: `${circuit.races[0].seasonYear} season`,
              href: `/seasons/${circuit.races[0].seasonYear}`,
              description: 'Standings, calendar and results',
            },
            { label: 'All circuits', href: '/circuits', description: 'Every venue on the map' },
          ]}
        />
      )}
    </div>
  )
}
