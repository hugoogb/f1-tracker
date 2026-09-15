import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { api, isNotFound } from '@/lib/api'
import type {
  Race,
  DriverStanding,
  ConstructorStanding,
  StandingsProgressionResponse,
  ConstructorProgressionResponse,
  SeasonHeatmapResponse,
  PermutationsResponse,
  PointsSystemsResponse,
  NormalisedStandingsResponse,
} from '@/lib/types'
import { CountryFlag } from '@/components/ui/country-flag'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { Badge } from '@/components/ui/badge'
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
import { ChampionshipProgressionChart } from '@/components/charts/championship-progression-chart'
import { SeasonHeatmap } from '@/components/charts/season-heatmap'
import { SeasonTabs } from './season-tabs'
import { TitlePermutations } from '@/components/seasons/title-permutations'
import { NormalisedStandings } from '@/components/seasons/normalised-standings'
import { FadeIn } from '@/components/ui/motion'
import { buildMetadata } from '@/lib/seo'
import { LocalDate } from '@/components/ui/local-date'

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

/**
 * Nothing is prerendered at build time: there are thousands of these pages and
 * the set changes with the data, so a build should not have to walk it. The
 * empty list still opts the route into the full route cache — the first request
 * for a path renders it, everything after is served from the cache until the
 * `f1-data` tag is purged by an ingest.
 */
/** Rows kept per re-scored table — the championship, not the whole entry list. */
const NORMALISED_ROWS = 20

export function generateStaticParams() {
  return []
}

export async function generateMetadata({ params }: { params: Promise<{ year: string }> }) {
  const { year } = await params
  return buildMetadata({
    title: `${year} F1 Season`,
    description:
      `The ${year} Formula 1 season: full race calendar and results, final driver and constructor ` +
      'standings, round-by-round championship progression and a season results heatmap.',
    path: `/seasons/${year}`,
  })
}

export default async function SeasonDetailPage({ params }: { params: Promise<{ year: string }> }) {
  const { year: yearStr } = await params
  const year = parseInt(yearStr, 10)

  if (isNaN(year)) notFound()

  const [
    season,
    driverStandings,
    constructorStandings,
    progressionResult,
    constructorProgressionResult,
    heatmapResult,
    permutationsResult,
    pointsSystemsResult,
  ] = await Promise.allSettled([
    api.seasons.get(year) as Promise<SeasonDetailResponse>,
    api.seasons.driverStandings(year) as Promise<DriverStandingsResponse>,
    api.seasons.constructorStandings(year) as Promise<ConstructorStandingsResponse>,
    api.seasons.standingsProgression(year) as Promise<StandingsProgressionResponse>,
    api.seasons.constructorProgression(year) as Promise<ConstructorProgressionResponse>,
    api.seasons.heatmap(year) as Promise<SeasonHeatmapResponse>,
    api.seasons.permutations(year) as Promise<PermutationsResponse>,
    api.pointsSystems(),
  ])

  // A year with no data must answer 404 — but an API outage has to surface as
  // an error rather than telling crawlers the season does not exist.
  if (season.status === 'rejected') {
    if (isNotFound(season.reason)) notFound()
    throw season.reason
  }

  const seasonData = season.value
  const driverStandingsData =
    driverStandings.status === 'fulfilled' ? driverStandings.value : { year, standings: [] }
  const constructorStandingsData =
    constructorStandings.status === 'fulfilled'
      ? constructorStandings.value
      : { year, standings: [] }
  const progression = progressionResult.status === 'fulfilled' ? progressionResult.value : null
  const constructorProgression =
    constructorProgressionResult.status === 'fulfilled' ? constructorProgressionResult.value : null
  const heatmap = heatmapResult.status === 'fulfilled' ? heatmapResult.value : null
  const permutations = permutationsResult.status === 'fulfilled' ? permutationsResult.value : null

  // Every era's re-scored table, rendered up front so switching between them is
  // instant and the route stays cacheable — a query parameter for one control
  // would make the whole season page dynamic.
  const pointsSystems: PointsSystemsResponse | null =
    pointsSystemsResult.status === 'fulfilled' ? pointsSystemsResult.value : null
  const normalisedResults = pointsSystems
    ? (
        await Promise.allSettled(
          pointsSystems.systems.map(
            (system) =>
              api.seasons.normalisedStandings(
                year,
                system.id,
              ) as Promise<NormalisedStandingsResponse>,
          ),
        )
      )
        .filter((r) => r.status === 'fulfilled')
        // Only the rows the table shows travel to the client. A 1950s season
        // can carry eighty entrants, and eight copies of that tail is a lot of
        // payload for rows nobody scrolls to.
        .map((r) => ({
          ...r.value,
          standings: r.value.standings.slice(0, NORMALISED_ROWS),
        }))
    : []

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: 'Seasons', href: '/seasons' },
          { label: String(year) },
        ]}
      />

      <FadeIn>
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <Link
              href={`/seasons/${year - 1}`}
              className="border-border inline-flex size-8 items-center justify-center rounded-lg border bg-[var(--surface-1)] text-sm font-medium transition-all hover:bg-[var(--surface-2)]"
              title={`${year - 1} Season`}
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <div>
              <h1>
                <span className="text-gradient">{year}</span>{' '}
                <span className="text-foreground">Season</span>
              </h1>
              <p className="text-muted-foreground">{seasonData.races.length} races</p>
            </div>
            <Link
              href={`/seasons/${year + 1}`}
              className="border-border inline-flex size-8 items-center justify-center rounded-lg border bg-[var(--surface-1)] text-sm font-medium transition-all hover:bg-[var(--surface-2)]"
              title={`${year + 1} Season`}
            >
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="accent-line" />
        </div>
      </FadeIn>

      {permutations && (
        <FadeIn>
          <TitlePermutations data={permutations} />
        </FadeIn>
      )}

      <SeasonTabs
        racesContent={<RacesTable races={seasonData.races} year={year} />}
        heatmapContent={
          heatmap && heatmap.drivers.length > 0 ? <SeasonHeatmap data={heatmap} /> : undefined
        }
        driverStandingsContent={
          <>
            {progression && progression.rounds.length > 1 && (
              <ChampionshipProgressionChart
                rounds={progression.rounds}
                drivers={progression.drivers}
              />
            )}
            <PointsBarChart standings={driverStandingsData.standings} />
            <DriverStandingsTable standings={driverStandingsData.standings} />
          </>
        }
        constructorStandingsContent={
          <>
            {constructorProgression && constructorProgression.rounds.length > 1 && (
              <ChampionshipProgressionChart
                rounds={constructorProgression.rounds}
                entries={constructorProgression.constructors}
              />
            )}
            <ConstructorPointsChart standings={constructorStandingsData.standings} />
            <ConstructorStandingsTable standings={constructorStandingsData.standings} />
          </>
        }
        whatIfContent={
          normalisedResults.length > 0 ? (
            <NormalisedStandings results={normalisedResults} year={year} />
          ) : undefined
        }
      />
    </div>
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
          <TableHead className="hidden md:table-cell">Circuit</TableHead>
          <TableHead className="hidden sm:table-cell">Country</TableHead>
          <TableHead className="text-right">Date</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {races.map((race) => (
          <TableRow key={race.round}>
            <TableCell>
              <Badge variant="outline" className="font-mono text-xs">
                R{race.round}
              </Badge>
            </TableCell>
            <TableCell>
              <Link
                href={`/seasons/${year}/races/${race.round}`}
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
                {race.circuit.country && <CountryFlag code={race.circuit.countryCode} />}
                {race.circuit.country}
              </span>
            </TableCell>
            <TableCell className="text-right whitespace-nowrap tabular-nums">
              <LocalDate value={race.date} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
