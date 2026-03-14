import Link from 'next/link'
import { notFound } from 'next/navigation'
import { api } from '@/lib/api'
import type { Race, DriverStanding, ConstructorStanding } from '@/lib/types'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
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
import { PointsBarChart } from '@/components/charts/points-bar-chart'
import { ConstructorPointsChart } from '@/components/charts/constructor-points-chart'
import { SeasonTabs } from './season-tabs'

export const dynamic = 'force-dynamic'

interface SeasonDetailResponse {
  year: number
  races: Race[]
}

interface DriverStandingsResponse {
  year: number
  standings: DriverStanding[]
}

interface ConstructorStandingsResponse {
  year: number
  standings: ConstructorStanding[]
}

export async function generateMetadata({ params }: { params: Promise<{ year: string }> }) {
  const { year } = await params
  return {
    title: `${year} Season | F1 Tracker`,
    description: `Races, driver standings, and constructor standings for the ${year} Formula 1 season.`,
  }
}

export default async function SeasonDetailPage({ params }: { params: Promise<{ year: string }> }) {
  const { year: yearStr } = await params
  const year = parseInt(yearStr, 10)

  if (isNaN(year)) notFound()

  const [season, driverStandings, constructorStandings] = await Promise.all([
    api.seasons.get(year) as Promise<SeasonDetailResponse>,
    api.seasons.driverStandings(year) as Promise<DriverStandingsResponse>,
    api.seasons.constructorStandings(year) as Promise<ConstructorStandingsResponse>,
  ])

  return (
    <main className="container mx-auto space-y-6 px-4 py-8">
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: 'Seasons', href: '/seasons' },
          { label: String(year) },
        ]}
      />
      <div>
        <h1>{year} Season</h1>
        <p className="text-muted-foreground mt-1">{season.races.length} races</p>
      </div>

      <SeasonTabs
        racesContent={<RacesTable races={season.races} year={year} />}
        driverStandingsContent={
          <>
            <PointsBarChart standings={driverStandings.standings} />
            <DriverStandingsTable standings={driverStandings.standings} />
          </>
        }
        constructorStandingsContent={
          <>
            <ConstructorPointsChart standings={constructorStandings.standings} />
            <ConstructorStandingsTable standings={constructorStandings.standings} />
          </>
        }
      />
    </main>
  )
}

function RacesTable({ races, year }: { races: Race[]; year: number }) {
  if (races.length === 0) {
    return <p className="text-muted-foreground text-sm">No races available for this season.</p>
  }

  return (
    <Table aria-label="Races">
      <TableHeader>
        <TableRow>
          <TableHead className="w-16">Round</TableHead>
          <TableHead>Race</TableHead>
          <TableHead>Circuit</TableHead>
          <TableHead>Date</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {races.map((race) => (
          <TableRow key={race.round}>
            <TableCell className="font-medium">{race.round}</TableCell>
            <TableCell>
              <Link
                href={`/seasons/${year}/races/${race.round}`}
                className="hover:text-primary transition-colors"
              >
                {race.name}
              </Link>
            </TableCell>
            <TableCell>
              <span className="text-muted-foreground">
                {race.circuit.location}, {race.circuit.country}
              </span>
            </TableCell>
            <TableCell className="whitespace-nowrap">
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
  )
}
