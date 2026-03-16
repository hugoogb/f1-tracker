import { notFound } from 'next/navigation'
import { api } from '@/lib/api'
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

  if (isNaN(yearNum) || isNaN(roundNum)) return { title: 'Race | F1 Tracker' }

  try {
    const race = (await api.races.get(yearNum, roundNum)) as RaceDetailResponse
    return {
      title: `${race.name} ${year} | F1 Tracker`,
      description: `Results and qualifying for the ${year} ${race.name} at ${race.circuit.name}.`,
    }
  } catch {
    return { title: 'Race | F1 Tracker' }
  }
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

  let race: RaceDetailResponse
  let qualifying: QualifyingResponse | null = null
  let sprint: SprintResponse | null = null
  let pitStops: PitStopsResponse | null = null
  let pitStopAnalysis: PitStopAnalysis | null = null
  let positions: PositionsResponse | null = null
  let laps: LapsResponse | null = null

  try {
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

    if (raceResult.status === 'rejected') notFound()
    race = raceResult.value

    if (qualifyingResult.status === 'fulfilled') {
      qualifying = qualifyingResult.value
    }
    if (sprintResult.status === 'fulfilled' && sprintResult.value.results?.length > 0) {
      sprint = sprintResult.value
    }
    if (pitStopsResult.status === 'fulfilled' && pitStopsResult.value.pitStops?.length > 0) {
      pitStops = pitStopsResult.value
    }
    if (
      pitStopAnalysisResult.status === 'fulfilled' &&
      pitStopAnalysisResult.value.totalStops > 0
    ) {
      pitStopAnalysis = pitStopAnalysisResult.value
    }
    if (positionsResult.status === 'fulfilled' && positionsResult.value.drivers?.length > 0) {
      positions = positionsResult.value
    }
    if (lapsResult.status === 'fulfilled' && lapsResult.value.drivers?.length > 0) {
      laps = lapsResult.value
    }
  } catch {
    notFound()
  }

  const podium = race.results
    .filter((r) => r.position && r.position <= 3)
    .sort((a, b) => (a.position ?? 99) - (b.position ?? 99))

  return (
    <div className="space-y-6">
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
              {new Date(race.date).toLocaleDateString('en-GB', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </p>
          </div>
          <div className="accent-line" />
        </div>
      </FadeIn>

      <PodiumCard podium={podium} />

      {race.fastestLap && <FastestLapCard fastestLap={race.fastestLap} />}

      <RaceTabs
        raceResultsContent={
          <ResultsTable results={race.results} fastestLapDriverRef={race.fastestLap?.driver.ref} />
        }
        qualifyingContent={
          qualifying ? (
            <QualifyingTable
              results={qualifying.results}
              fastestSectors={qualifying.fastestSectors}
            />
          ) : (
            <p className="text-muted-foreground text-sm">
              No qualifying data available for this race.
            </p>
          )
        }
        sprintContent={
          sprint ? (
            <SprintTable results={sprint.results} />
          ) : year >= 2021 ? (
            <p className="text-muted-foreground text-sm">No sprint data available for this race.</p>
          ) : undefined
        }
        pitStopsContent={
          pitStops ? (
            <div className="space-y-8">
              {pitStopAnalysis && <PitStopAnalysisView analysis={pitStopAnalysis} />}
              <div>
                <h3 className="mb-3 text-sm font-medium">All Pit Stops</h3>
                <PitStopsTable pitStops={pitStops.pitStops} />
              </div>
            </div>
          ) : year >= 2012 ? (
            <p className="text-muted-foreground text-sm">
              No pit stop data available for this race.
            </p>
          ) : undefined
        }
        lapsContent={
          laps ? (
            <div className="space-y-8">
              {positions && (
                <div>
                  <h3 className="mb-3 text-sm font-medium">Race Positions</h3>
                  <PositionChart drivers={positions.drivers} totalLaps={positions.totalLaps} />
                </div>
              )}
              <div>
                <h3 className="mb-3 text-sm font-medium">Lap Times</h3>
                <LapTimesChart drivers={laps.drivers} />
              </div>
              <div>
                <h3 className="mb-3 text-sm font-medium">Tyre Strategy</h3>
                <TyreStrategyChart drivers={laps.drivers} />
              </div>
            </div>
          ) : year >= 2018 ? (
            <p className="text-muted-foreground text-sm">
              No lap time data available for this race.
            </p>
          ) : undefined
        }
      />
    </div>
  )
}
