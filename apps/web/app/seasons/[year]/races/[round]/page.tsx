import { notFound } from 'next/navigation'
import { api, isNotFound } from '@/lib/api'
import type {
  Race,
  RaceResult,
  QualifyingResult,
  SprintResult,
  PitStop,
  LapsResponse,
  FastestLap,
  FastestSectors,
  PitStopAnalysis,
  PositionsResponse,
} from '@/lib/types'
import { CountryFlag } from '@/components/ui/country-flag'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { Badge } from '@/components/ui/badge'
import { ResultsTable } from '@/components/races/results-table'
import { PodiumCard } from '@/components/races/podium-card'
import { FastestLapCard } from '@/components/races/fastest-lap-card'
import { QualifyingTable } from '@/components/races/qualifying-table'
import { SprintTable } from '@/components/races/sprint-table'
import { PitStopsTable } from '@/components/races/pit-stops-table'
import { PitStopAnalysisView } from '@/components/races/pit-stop-analysis'
import { LapTimesChart } from '@/components/races/lap-times-chart'
import { TyreStrategyChart } from '@/components/races/tyre-strategy-chart'
import { PositionChart } from '@/components/races/position-chart'
import { RaceTabs } from './race-tabs'
import { FadeIn } from '@/components/ui/motion'
import { JsonLd } from '@/components/seo/json-ld'
import { raceSchema } from '@/lib/structured-data'
import { buildMetadata, SITE_DESCRIPTION } from '@/lib/seo'
import { LocalDate, LocalDateTime } from '@/components/ui/local-date'

export const dynamic = 'force-dynamic'

interface RaceDetailResponse extends Race {
  fastestLap: FastestLap | null
  results: RaceResult[]
}

interface QualifyingResponse {
  raceId: string
  fastestSectors: FastestSectors | null
  results: QualifyingResult[]
}

interface SprintResponse {
  raceId: string
  results: SprintResult[]
}

interface PitStopsResponse {
  raceId: string
  /** The race's quickest pit lane time, in seconds. */
  benchmark: string | null
  pitStops: PitStop[]
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ year: string; round: string }>
}) {
  const { year, round } = await params
  const yearNum = parseInt(year, 10)
  const roundNum = parseInt(round, 10)
  const path = `/seasons/${year}/races/${round}`

  const fallback = () =>
    buildMetadata({ title: 'Race', description: SITE_DESCRIPTION, path, noindex: true })

  if (isNaN(yearNum) || isNaN(roundNum)) return fallback()

  let race: RaceDetailResponse
  try {
    race = (await api.races.get(yearNum, roundNum)) as RaceDetailResponse
  } catch {
    // The page itself decides between 404 and error; metadata must not throw.
    return fallback()
  }

  const winner = race.results.find((result) => result.position === 1)
  const podium = race.results
    .filter((result) => result.position !== null && result.position <= 3)
    .sort((a, b) => (a.position ?? 99) - (b.position ?? 99))
    .map((result) => `${result.driver.firstName} ${result.driver.lastName}`)

  return buildMetadata({
    title: `${race.name} ${year}`,
    description:
      `Full results for the ${year} ${race.name} at ${race.circuit.name}` +
      (winner ? `, won by ${winner.driver.firstName} ${winner.driver.lastName}` : '') +
      `${podium.length === 3 ? ` ahead of ${podium[1]} and ${podium[2]}` : ''}. ` +
      'Qualifying, grid, pit stops and lap-by-lap analysis.',
    path,
    type: 'article',
  })
}

export default async function RaceDetailPage({
  params,
}: {
  params: Promise<{ year: string; round: string }>
}) {
  const { year: yearStr, round: roundStr } = await params
  const year = parseInt(yearStr, 10)
  const round = parseInt(roundStr, 10)

  if (isNaN(year) || isNaN(round)) notFound()

  let qualifying: QualifyingResponse | null = null
  let sprint: SprintResponse | null = null
  let pitStops: PitStopsResponse | null = null
  let pitStopAnalysis: PitStopAnalysis | null = null
  let positions: PositionsResponse | null = null
  let laps: LapsResponse | null = null

  const [
    raceResult,
    qualifyingResult,
    sprintResult,
    pitStopsResult,
    pitStopAnalysisResult,
    positionsResult,
    lapsResult,
  ] = await Promise.allSettled([
    api.races.get(year, round) as Promise<RaceDetailResponse>,
    api.races.qualifying(year, round) as Promise<QualifyingResponse>,
    year >= 2021
      ? (api.races.sprint(year, round) as Promise<SprintResponse>)
      : Promise.reject('not applicable'),
    year >= 2012
      ? (api.races.pitStops(year, round) as Promise<PitStopsResponse>)
      : Promise.reject('not applicable'),
    year >= 2012
      ? (api.races.pitStopAnalysis(year, round) as Promise<PitStopAnalysis>)
      : Promise.reject('not applicable'),
    year >= 2018
      ? (api.races.positions(year, round) as Promise<PositionsResponse>)
      : Promise.reject('not applicable'),
    year >= 2018
      ? (api.races.laps(year, round) as Promise<LapsResponse>)
      : Promise.reject('not applicable'),
  ])

  // A round that does not exist must answer 404 — but an API outage has to
  // surface as an error rather than telling crawlers the race never happened.
  if (raceResult.status === 'rejected') {
    if (isNotFound(raceResult.reason)) notFound()
    throw raceResult.reason
  }
  const race = raceResult.value

  if (qualifyingResult.status === 'fulfilled') {
    qualifying = qualifyingResult.value
  }
  if (sprintResult.status === 'fulfilled' && sprintResult.value.results?.length > 0) {
    sprint = sprintResult.value
  }
  if (pitStopsResult.status === 'fulfilled' && pitStopsResult.value.pitStops?.length > 0) {
    pitStops = pitStopsResult.value
  }
  if (pitStopAnalysisResult.status === 'fulfilled' && pitStopAnalysisResult.value.totalStops > 0) {
    pitStopAnalysis = pitStopAnalysisResult.value
  }
  if (positionsResult.status === 'fulfilled' && positionsResult.value.drivers?.length > 0) {
    positions = positionsResult.value
  }
  if (lapsResult.status === 'fulfilled' && lapsResult.value.drivers?.length > 0) {
    laps = lapsResult.value
  }

  const podium = race.results
    .filter((r) => r.position && r.position <= 3)
    .sort((a, b) => (a.position ?? 99) - (b.position ?? 99))

  return (
    <div className="space-y-6">
      <JsonLd
        data={raceSchema({
          name: `${year} ${race.name}`,
          path: `/seasons/${year}/races/${round}`,
          startDate: race.date,
          circuitName: race.circuit.name,
          locality: race.circuit.location,
          country: race.circuit.country,
        })}
      />
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: 'Seasons', href: '/seasons' },
          { label: String(year), href: `/seasons/${year}` },
          { label: race.name },
        ]}
      />

      <FadeIn>
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="font-mono">
                Round {round}
              </Badge>
            </div>
            <h1 className="text-gradient">{race.name}</h1>
          </div>
          <div className="glass rounded-xl px-5 py-4">
            <p className="text-foreground inline-flex items-center gap-1.5 font-medium">
              {race.circuit.country && <CountryFlag code={race.circuit.countryCode} />}
              {race.circuit.name}
            </p>
            <p className="text-muted-foreground text-sm">
              {race.circuit.location}, {race.circuit.country}
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              {race.schedule?.race ? (
                <LocalDateTime value={race.schedule.race} style="full" />
              ) : (
                <LocalDate value={race.date} style="full" />
              )}
            </p>
          </div>
          <div className="accent-line" />
        </div>
      </FadeIn>

      <PodiumCard podium={podium} />

      {race.fastestLap && <FastestLapCard fastestLap={race.fastestLap} />}

      <RaceTabs
        tabs={[
          {
            id: 'results',
            label: 'Race Results',
            content: (
              <ResultsTable
                results={race.results}
                fastestLapDriverRef={race.fastestLap?.driver.ref}
              />
            ),
          },
          {
            id: 'qualifying',
            label: 'Qualifying',
            content: qualifying ? (
              <QualifyingTable
                results={qualifying.results}
                fastestSectors={qualifying.fastestSectors}
              />
            ) : (
              <p className="text-muted-foreground text-sm">
                No qualifying data available for this race.
              </p>
            ),
          },
          ...(sprint || year >= 2021
            ? [
                {
                  id: 'sprint',
                  label: 'Sprint',
                  content: sprint ? (
                    <SprintTable results={sprint.results} />
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      No sprint data available for this race.
                    </p>
                  ),
                },
              ]
            : []),
          // Strategy is where the stops and the stints belong together: a tyre
          // stint only ends because of a pit stop.
          ...(pitStops || laps || year >= 2012
            ? [
                {
                  id: 'strategy',
                  label: 'Strategy',
                  content:
                    pitStops || laps ? (
                      <div className="space-y-8">
                        {laps && (
                          <div>
                            <h3 className="mb-3 text-sm font-medium">Tyre Strategy</h3>
                            <TyreStrategyChart drivers={laps.drivers} />
                          </div>
                        )}
                        {pitStopAnalysis && <PitStopAnalysisView analysis={pitStopAnalysis} />}
                        {pitStops && (
                          <div>
                            <h3 className="mb-3 text-sm font-medium">All Pit Stops</h3>
                            <PitStopsTable
                              pitStops={pitStops.pitStops}
                              benchmark={pitStops.benchmark}
                            />
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-sm">
                        No strategy data available for this race.
                      </p>
                    ),
                },
              ]
            : []),
          ...(laps || year >= 2018
            ? [
                {
                  id: 'lap-times',
                  label: 'Lap Times',
                  content: laps ? (
                    <LapTimesChart drivers={laps.drivers} />
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      No lap time data available for this race.
                    </p>
                  ),
                },
              ]
            : []),
          ...(positions
            ? [
                {
                  id: 'positions',
                  label: 'Positions',
                  content: (
                    <PositionChart drivers={positions.drivers} totalLaps={positions.totalLaps} />
                  ),
                },
              ]
            : []),
        ]}
      />
    </div>
  )
}
