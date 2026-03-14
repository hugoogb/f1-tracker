import { notFound } from 'next/navigation'
import { api } from '@/lib/api'
import type { Race, RaceResult, QualifyingResult, SprintResult, PitStop } from '@/lib/types'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { ResultsTable } from '@/components/races/results-table'
import { QualifyingTable } from '@/components/races/qualifying-table'
import { SprintTable } from '@/components/races/sprint-table'
import { PitStopsTable } from '@/components/races/pit-stops-table'
import { RaceTabs } from './race-tabs'

export const dynamic = 'force-dynamic'

interface RaceDetailResponse extends Race {
  results: RaceResult[]
}

interface QualifyingResponse {
  raceId: string
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

  try {
    const [raceResult, qualifyingResult, sprintResult, pitStopsResult] = await Promise.allSettled([
      api.races.get(year, round) as Promise<RaceDetailResponse>,
      api.races.qualifying(year, round) as Promise<QualifyingResponse>,
      year >= 2021
        ? (api.races.sprint(year, round) as Promise<SprintResponse>)
        : Promise.reject('not applicable'),
      year >= 2012
        ? (api.races.pitStops(year, round) as Promise<PitStopsResponse>)
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
  } catch {
    notFound()
  }

  return (
    <main className="container mx-auto space-y-6 px-4 py-8">
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: 'Seasons', href: '/seasons' },
          { label: String(year), href: `/seasons/${year}` },
          { label: race.name },
        ]}
      />
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{race.name}</h1>
        <p className="text-muted-foreground mt-1">
          {race.circuit.name} - {race.circuit.location}, {race.circuit.country}
        </p>
        <p className="text-muted-foreground text-sm">
          {new Date(race.date).toLocaleDateString('en-GB', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>
      </div>

      <RaceTabs
        raceResultsContent={<ResultsTable results={race.results} />}
        qualifyingContent={
          qualifying ? (
            <QualifyingTable results={qualifying.results} />
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
            <PitStopsTable pitStops={pitStops.pitStops} />
          ) : year >= 2012 ? (
            <p className="text-muted-foreground text-sm">
              No pit stop data available for this race.
            </p>
          ) : undefined
        }
      />
    </main>
  )
}
