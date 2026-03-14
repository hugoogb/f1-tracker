import { notFound } from 'next/navigation'
import { api } from '@/lib/api'
import type { Race, RaceResult, QualifyingResult, SprintResult, PitStop } from '@/lib/types'
import { COUNTRY_FLAGS, TEAM_COLORS } from '@/lib/constants'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { ResultsTable } from '@/components/races/results-table'
import { QualifyingTable } from '@/components/races/qualifying-table'
import { SprintTable } from '@/components/races/sprint-table'
import { PitStopsTable } from '@/components/races/pit-stops-table'
import { RaceTabs } from './race-tabs'
import Link from 'next/link'

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

  const flag = race.circuit.country ? COUNTRY_FLAGS[race.circuit.country] : null
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
          <p className="text-foreground font-medium">
            {flag && <span className="mr-1.5">{flag}</span>}
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

      {/* Podium */}
      {podium.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {podium.map((result) => {
            const teamColor =
              TEAM_COLORS[result.constructor.ref] ?? result.constructor.color ?? null
            const podiumColors = [
              'border-amber-500/40 bg-amber-500/5',
              'border-zinc-400/40 bg-zinc-400/5',
              'border-orange-600/40 bg-orange-600/5',
            ]
            const podiumLabels = ['1st', '2nd', '3rd']
            const idx = (result.position ?? 1) - 1

            return (
              <Card key={result.driver.ref} className={`${podiumColors[idx]} border`}>
                <CardContent className="space-y-1 px-4 py-3">
                  <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
                    {podiumLabels[idx]}
                  </p>
                  <Link
                    href={`/drivers/${result.driver.ref}`}
                    className="hover:text-primary text-sm font-semibold transition-colors"
                  >
                    {result.driver.firstName} {result.driver.lastName}
                  </Link>
                  <div className="flex items-center gap-1.5">
                    {teamColor && (
                      <span
                        className="inline-block h-3 w-1 rounded-full"
                        style={{ backgroundColor: teamColor }}
                      />
                    )}
                    <Link
                      href={`/constructors/${result.constructor.ref}`}
                      className="text-muted-foreground hover:text-foreground text-xs transition-colors"
                    >
                      {result.constructor.name}
                    </Link>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

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
    </div>
  )
}
