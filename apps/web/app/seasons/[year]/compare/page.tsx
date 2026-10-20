import { notFound } from 'next/navigation'
import { GitCompareArrows } from 'lucide-react'
import { api, ApiError, isNotFound } from '@/lib/api'
import type { SeasonCompareResponse, SeasonCompareType } from '@/lib/types'
import { teamColorOf } from '@/lib/utils'
import { buildMetadata } from '@/lib/seo'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { FadeIn } from '@/components/ui/motion'
import { HeadToHeadCard } from '@/components/compare/head-to-head-card'
import { SeasonPointsDeltaChart } from '@/components/charts/season-points-delta-chart'
import { QualifyingGapChart } from '@/components/charts/qualifying-gap-chart'
import { ComparePickers, type PickerOption } from '@/components/season-compare/compare-pickers'
import { DeltaHeader } from '@/components/season-compare/delta-header'
import { StatRows } from '@/components/season-compare/stat-rows'
import { RoundsTable } from '@/components/season-compare/rounds-table'
import { describeSides, formatPoints } from '@/components/season-compare/sides'

type SearchParams = Promise<{ type?: string; a?: string; b?: string }>

function parseType(value: string | undefined): SeasonCompareType {
  return value === 'drivers' ? 'drivers' : 'constructors'
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ year: string }>
  searchParams: SearchParams
}) {
  const { year } = await params
  const { type } = await searchParams
  const kind = parseType(type) === 'drivers' ? 'drivers' : 'constructors'
  // Every pairing is its own URL, so the comparison stays out of the index —
  // the season page is what search engines should land on.
  return buildMetadata({
    title: `${year} Season Comparison`,
    description: `Compare two ${kind} across the ${year} Formula 1 season: the points gap round by round, finishes, grids, head-to-heads and qualifying gaps.`,
    path: `/seasons/${year}/compare`,
    noindex: true,
  })
}

export default async function SeasonComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ year: string }>
  searchParams: SearchParams
}) {
  const { year: yearStr } = await params
  const year = parseInt(yearStr, 10)
  if (isNaN(year)) notFound()

  const query = await searchParams
  const type = parseType(query.type)

  const [entrantsResult] = await Promise.allSettled([api.seasonCompare.entrants(year)])
  if (entrantsResult.status === 'rejected') {
    if (isNotFound(entrantsResult.reason)) notFound()
    throw entrantsResult.reason
  }
  const entrants = entrantsResult.value

  const constructorOptions: PickerOption[] = entrants.constructors.map((c) => ({
    ref: c.ref,
    label: c.name,
    color: teamColorOf(c.color)!,
  }))
  const driverOptions: PickerOption[] = entrants.drivers.map((d) => ({
    ref: d.ref,
    label: `${d.firstName} ${d.lastName}`,
    color: teamColorOf(d.constructor.color)!,
  }))
  const options = type === 'drivers' ? driverOptions : constructorOptions

  // Default to the top two of the standings, which is where the entrants list starts.
  const a = query.a || options[0]?.ref || ''
  const b = query.b || options.find((o) => o.ref !== a)?.ref || ''

  let data: SeasonCompareResponse | null = null
  let problem: string | null = null
  if (options.length < 2) {
    problem = `Fewer than two ${type} have raced in ${year} so far.`
  } else if (a === b) {
    problem = 'Pick two different sides to compare.'
  } else {
    const [result] = await Promise.allSettled([
      type === 'drivers'
        ? api.seasonCompare.drivers(year, a, b)
        : api.seasonCompare.constructors(year, a, b),
    ])
    if (result.status === 'fulfilled') {
      data = result.value
    } else if (isNotFound(result.reason)) {
      // The season exists (the entrants loaded), so a 404 here is a pick that did not race.
      problem = `One of those ${type} did not race in ${year}. Pick from this season's entrants.`
    } else if (result.reason instanceof ApiError && result.reason.status === 400) {
      problem = 'Pick two different sides to compare.'
    } else {
      throw result.reason
    }
  }

  const sides = data ? describeSides(data) : null
  // Read off the data, never asserted from the era: a total below what was scored.
  const droppedParts: string[] = []
  if (data && sides && data.points.dropped) {
    const { a: droppedA, b: droppedB } = data.points.dropped
    if (droppedA && droppedA > 0) {
      droppedParts.push(`${sides[0].short} dropped ${formatPoints(droppedA)} pts`)
    }
    if (droppedB && droppedB > 0) {
      droppedParts.push(`${sides[1].short} dropped ${formatPoints(droppedB)} pts`)
    }
  }
  const dropped = droppedParts.join(', ')
  const swapHref = `/seasons/${year}/compare?${new URLSearchParams({ type, a: b, b: a })}`
  const quali = data
    ? data.rounds.flatMap((r) =>
        r.qualifyingGap ? [{ round: r.round, raceName: r.raceName, ...r.qualifyingGap }] : [],
      )
    : []

  return (
    <div className="space-y-8">
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: 'Seasons', href: '/seasons' },
          { label: String(year), href: `/seasons/${year}` },
          { label: 'Compare' },
        ]}
      />

      <PageHeader
        title={`${year} Season Comparison`}
        description={`Two ${type} through the ${year} season, round by round. Every gap is the first pick minus the second.`}
      />

      <Card>
        <CardContent className="pt-6">
          <ComparePickers
            year={year}
            type={type}
            a={a}
            b={b}
            constructors={constructorOptions}
            drivers={driverOptions}
          />
        </CardContent>
      </Card>

      {!data || !sides ? (
        <EmptyState
          icon={GitCompareArrows}
          title="Nothing to compare yet"
          description={problem ?? undefined}
          action={{ label: `Back to ${year}`, href: `/seasons/${year}` }}
        />
      ) : (
        <>
          <FadeIn>
            <DeltaHeader data={data} sides={sides} swapHref={swapHref} />
          </FadeIn>

          <FadeIn>
            <Card>
              <CardHeader>
                <CardTitle>Points, Round by Round</CardTitle>
                <p className="text-muted-foreground text-xs">
                  Race and sprint points as they were awarded, added up after each round.
                  {data.pointsSource === 'results'
                    ? ` There was no official ${type === 'constructors' ? "constructors' " : ''}championship table in ${year}, so these sums are also the totals above.`
                    : ' The totals above are the official championship standings.'}
                </p>
                {dropped && (
                  <p className="text-muted-foreground text-xs">
                    Not every result counted in {year}: {dropped}. That is why the line ends above
                    the official totals.
                  </p>
                )}
              </CardHeader>
              <CardContent>
                <SeasonPointsDeltaChart
                  rounds={data.rounds.map((r) => ({
                    round: r.round,
                    raceName: r.raceName,
                    a: r.a.cumulativePoints,
                    b: r.b.cumulativePoints,
                    delta: r.cumulativeDelta ?? 0,
                  }))}
                  sideA={sides[0]}
                  sideB={sides[1]}
                />
              </CardContent>
            </Card>
          </FadeIn>

          <div className="grid gap-6 lg:grid-cols-2">
            <FadeIn>
              <StatRows data={data} sides={sides} />
            </FadeIn>
            <div className="space-y-6">
              <FadeIn>
                <HeadToHeadCard
                  title={
                    type === 'constructors' ? 'Race Head to Head (best car)' : 'Race Head to Head'
                  }
                  h2h={{
                    driver1Wins: data.headToHead.race.a,
                    driver2Wins: data.headToHead.race.b,
                    totalRaces: data.headToHead.race.total,
                  }}
                  driver1LastName={sides[0].short}
                  driver2LastName={sides[1].short}
                  color1={sides[0].color}
                  color2={sides[1].color}
                  totalLabel="races both started"
                />
              </FadeIn>
              <FadeIn>
                <HeadToHeadCard
                  title={
                    type === 'constructors'
                      ? 'Qualifying Head to Head (best car)'
                      : 'Qualifying Head to Head'
                  }
                  h2h={{
                    driver1Wins: data.headToHead.qualifying.a,
                    driver2Wins: data.headToHead.qualifying.b,
                    totalRaces: data.headToHead.qualifying.total,
                  }}
                  driver1LastName={sides[0].short}
                  driver2LastName={sides[1].short}
                  color1={sides[0].color}
                  color2={sides[1].color}
                  totalLabel="sessions both qualified"
                />
              </FadeIn>
            </div>
          </div>

          {quali.length > 0 && (
            <FadeIn>
              <Card>
                <CardHeader>
                  <CardTitle>Qualifying Gap by Round</CardTitle>
                  <p className="text-muted-foreground text-xs">
                    Best lap in the last session both reached, as a percentage of the quicker one.
                    Below zero is {sides[0].short} on top. {quali.length} of {data.roundsShared}{' '}
                    shared rounds have times for both.
                  </p>
                </CardHeader>
                <CardContent>
                  <QualifyingGapChart gaps={quali} sideA={sides[0]} sideB={sides[1]} />
                </CardContent>
              </Card>
            </FadeIn>
          )}

          <FadeIn>
            <Card>
              <CardHeader>
                <CardTitle>Round by Round</CardTitle>
                <p className="text-muted-foreground text-xs">
                  Position deltas are {sides[0].short} minus {sides[1].short}: negative means{' '}
                  {sides[0].short} finished or started ahead.
                </p>
              </CardHeader>
              <CardContent>
                <RoundsTable data={data} sides={sides} />
              </CardContent>
            </Card>
          </FadeIn>
        </>
      )}
    </div>
  )
}
