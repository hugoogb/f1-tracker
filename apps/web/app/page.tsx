import Link from 'next/link'
import type { Metadata } from 'next'

import { api } from '@/lib/api'
import type {
  DriverStanding,
  ConstructorStanding,
  PermutationsResponse,
  Race,
  RaceResult,
  SeasonCalendarResponse,
  SeasonChampion,
} from '@/lib/types'
import { raceStart } from '@/lib/schedule'
import { FadeIn } from '@/components/ui/motion'
import { NextRaceCountdown } from '@/components/ui/next-race-countdown'
import { Panel } from '@/components/ui/panel'
import { SectionHeader } from '@/components/ui/section-header'
import { Tag } from '@/components/ui/tag'
import { TrackOutline } from '@/components/circuits/track-outline'
import { FavouritesSummary } from '@/components/favourites/favourites-summary'
import { SeasonCalendarMapWrapper } from '@/components/seasons/season-calendar-map-wrapper'
import { TitlePermutations } from '@/components/seasons/title-permutations'
import { StandingsPanel } from '@/components/home/standings-panel'
import { LastRacePodium } from '@/components/home/last-race-podium'
import { ExploreGrid, type ExploreTile } from '@/components/home/explore-grid'

import { SITE_DESCRIPTION, SITE_NAME, absoluteUrl } from '@/lib/seo'

// Shorter than the site-wide backstop because this page splits the calendar on
// the render-time clock (`now` below), not just on the data. An hour is enough:
// the split only moves when a race starts, and the result itself does not exist
// until the ingest, which purges this page at once (it reads only `f1-global`
// and current-season tags). Every regeneration is a function invocation, so
// five minutes cost twelve times as many for the same page.
export const revalidate = 3600

export const metadata: Metadata = {
  // `absolute` opts out of the root layout's `%s | F1 Tracker` template, which
  // would otherwise render as "F1 Tracker | F1 Tracker".
  title: { absolute: `${SITE_NAME} — Formula 1 history, stats and analytics` },
  description: SITE_DESCRIPTION,
  alternates: { canonical: absoluteUrl('/') },
}

export default async function Home() {
  const [seasonsResponse, championsResult, bestSeasonsResult, recordsResult] =
    await Promise.allSettled([
      api.seasons.list(),
      api.champions() as Promise<{ data: SeasonChampion[] }>,
      api.bestSeasons.list(),
      api.records() as Promise<RecordsTeaserResponse>,
    ])

  const seasons = seasonsResponse.status === 'fulfilled' ? seasonsResponse.value : null
  const champions = championsResult.status === 'fulfilled' ? championsResult.value.data : []
  const bestSeasons =
    bestSeasonsResult.status === 'fulfilled' ? bestSeasonsResult.value.seasons : []
  const records = recordsResult.status === 'fulfilled' ? recordsResult.value : null

  const latestYear = seasons?.data[0]?.year

  if (!latestYear) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center">
        <h1>F1 Tracker</h1>
        <p className="text-muted-foreground mt-4">No season data available yet.</p>
      </div>
    )
  }

  // Settled, not all: a season whose calendar is published before its first
  // race has no standings yet, and that must not take the whole page down.
  const [
    driverStandingsResponse,
    constructorStandingsResponse,
    seasonDetail,
    calendarResult,
    permutationsResult,
  ] = await Promise.allSettled([
    api.seasons.driverStandings(latestYear) as Promise<{ standings: DriverStanding[] }>,
    api.seasons.constructorStandings(latestYear) as Promise<{ standings: ConstructorStanding[] }>,
    api.seasons.get(latestYear) as Promise<{ year: number; races: Race[] }>,
    api.seasons.calendar(latestYear) as Promise<SeasonCalendarResponse>,
    api.seasons.permutations(latestYear) as Promise<PermutationsResponse>,
  ])

  const driverStandings =
    driverStandingsResponse.status === 'fulfilled'
      ? (driverStandingsResponse.value.standings ?? [])
      : []
  const constructorStandings =
    constructorStandingsResponse.status === 'fulfilled'
      ? (constructorStandingsResponse.value.standings ?? [])
      : []
  const races = seasonDetail.status === 'fulfilled' ? (seasonDetail.value.races ?? []) : []
  const calendarRounds = calendarResult.status === 'fulfilled' ? calendarResult.value.rounds : []
  const permutations = permutationsResult.status === 'fulfilled' ? permutationsResult.value : null

  // Reading the clock in a server component is the point here — the lint rule
  // is aimed at client components, where an impure read would drift between
  // renders. It does make this page's output time-dependent, which is what the
  // one-hour `revalidate` above bounds.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  // A race counts as done once its start time has passed. Seasons f1db does not
  // schedule fall back to the calendar date, which is midnight UTC — close
  // enough to place a race on one side of "now" or the other.
  const startOf = (race: Race) => Date.parse(raceStart(race))
  const nextRace = races.find((r) => startOf(r) > now) ?? null
  // The last round with a result, not the last date passed: between a race and
  // the Monday ingest the clock is ahead of the data, and the podium would be empty.
  const lastRaced = [...calendarRounds].reverse().find((r) => r.winner !== null) ?? null
  const lastRace = lastRaced ? (races.find((r) => r.round === lastRaced.round) ?? null) : null
  const nextRound = nextRace ? calendarRounds.find((r) => r.round === nextRace.round) : undefined

  const lastResult = lastRace
    ? await api.races
        .get(latestYear, lastRace.round)
        .then((r) => (r as { results: RaceResult[] }).results)
        .catch(() => [] as RaceResult[])
    : []
  const podium = lastResult
    .filter((r) => r.position !== null && r.position <= 3)
    .map((r) => ({
      position: r.position!,
      driverName: `${r.driver.firstName} ${r.driver.lastName}`,
      driverHref: `/drivers/${r.driver.ref}`,
      teamName: r.constructor?.name ?? null,
      teamColor: r.constructor?.color ?? null,
      time: r.time,
    }))

  const leader = driverStandings[0]
  const runnerUp = driverStandings[1]
  const closest = bestSeasons.find((s) => s.rank === 1)
  const mostWins = records?.drivers?.mostWins?.[0]
  const latestChampion = champions[0]

  const tiles: ExploreTile[] = [
    ...(closest
      ? [
          {
            eyebrow: 'Best seasons',
            title: `${closest.year}`,
            teaser: closest.champion
              ? `The best title fight on record: ${closest.champion.driver.lastName} by ${closest.titleMargin} pts.`
              : 'Every title fight, ranked by how close it was.',
            href: '/best-seasons',
          },
        ]
      : []),
    ...(leader && runnerUp
      ? [
          {
            eyebrow: 'Compare',
            title: `${leader.driver.code ?? leader.driver.lastName} v ${runnerUp.driver.code ?? runnerUp.driver.lastName}`,
            teaser: `${leader.driver.lastName} and ${runnerUp.driver.lastName}, round by round this season.`,
            href: `/seasons/${latestYear}/compare?type=drivers`,
            accent: leader.constructor?.color ?? null,
          },
        ]
      : []),
    ...(mostWins
      ? [
          {
            eyebrow: 'Records',
            title: `${mostWins.count} wins`,
            teaser: `${mostWins.driver.firstName} ${mostWins.driver.lastName} leads the all-time list.`,
            href: '/records',
          },
        ]
      : []),
    ...(latestChampion
      ? [
          {
            eyebrow: 'Champions',
            title: `${latestChampion.year}`,
            teaser: `${latestChampion.driver.firstName} ${latestChampion.driver.lastName} is the latest of every world champion since 1950.`,
            href: '/champions',
            accent: latestChampion.constructor?.color ?? null,
          },
        ]
      : []),
  ]

  return (
    <div className="space-y-14">
      {/* Right now */}
      <section aria-labelledby="now-heading" className="space-y-6">
        <FadeIn>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Tag variant="red">Formula 1 · {latestYear}</Tag>
              {races.length > 0 && (
                <Tag variant="outline">
                  {lastRace ? `After round ${lastRace.round} of ${races.length}` : 'Season ahead'}
                </Tag>
              )}
            </div>
            <h1 id="now-heading">
              {leader ? (
                <>
                  {leader.driver.lastName}{' '}
                  <span className="text-primary">
                    {runnerUp
                      ? `+${Math.round((leader.points - runnerUp.points) * 10) / 10}`
                      : 'leads'}
                  </span>
                </>
              ) : (
                <>Formula 1 {latestYear}</>
              )}
            </h1>
            <p className="text-muted-foreground max-w-2xl">
              {leader && runnerUp
                ? `${leader.driver.firstName} ${leader.driver.lastName} leads ${runnerUp.driver.lastName} in the drivers' championship. Every season since 1950 is here too.`
                : 'Every season, driver, team and circuit from 1950 to today.'}
            </p>
          </div>
        </FadeIn>

        {nextRace && (
          <FadeIn>
            <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
              <NextRaceCountdown race={nextRace} seasonYear={latestYear} />
              {nextRound?.circuit.layoutSvgId && (
                <Panel className="items-center justify-center px-6">
                  <TrackOutline
                    svgId={nextRound.circuit.layoutSvgId}
                    name={nextRound.circuit.name}
                    className="h-40 w-full"
                  />
                  <p className="label">{nextRound.circuit.name}</p>
                </Panel>
              )}
            </div>
          </FadeIn>
        )}

        <FavouritesSummary />

        <FadeIn>
          <div className="grid gap-4 lg:grid-cols-3">
            <StandingsPanel
              title="Drivers' championship"
              href={`/seasons/${latestYear}`}
              rows={driverStandings.slice(0, 5).map((s) => ({
                position: s.position,
                name: s.driver.lastName,
                sub: s.constructor?.name,
                color: s.constructor?.color ?? null,
                points: s.points,
                href: `/drivers/${s.driver.ref}`,
              }))}
            />
            <StandingsPanel
              title="Constructors' championship"
              href={`/seasons/${latestYear}`}
              rows={constructorStandings.slice(0, 5).map((s) => ({
                position: s.position,
                name: s.constructor.name,
                color: s.constructor.color ?? null,
                points: s.points,
                href: `/constructors/${s.constructor.ref}`,
              }))}
            />
            {lastRace && podium.length > 0 && (
              <LastRacePodium
                raceName={lastRace.name}
                href={`/seasons/${latestYear}/races/${lastRace.round}`}
                podium={podium}
              />
            )}
          </div>
        </FadeIn>

        {permutations && <TitlePermutations data={permutations} />}
      </section>

      {/* Explore */}
      {tiles.length > 0 && (
        <section aria-labelledby="explore-heading" className="space-y-4">
          <SectionHeader eyebrow="Beyond the standings" title="Explore" />
          <ExploreGrid tiles={tiles} />
        </section>
      )}

      {/* The season on the map — the client works out which race is next */}
      {calendarRounds.length > 0 && (
        <section className="space-y-4" aria-labelledby="season-map-heading">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-1">
              <p className="label">The season on the map</p>
              <h2 id="season-map-heading">{latestYear} World Tour</h2>
            </div>
            <Link
              href={`/seasons/${latestYear}#calendar`}
              className="font-data text-primary hover:text-foreground focus-ring text-xs font-semibold tracking-wider uppercase"
            >
              Full season map
            </Link>
          </div>
          <SeasonCalendarMapWrapper year={latestYear} rounds={calendarRounds} variant="home" />
        </section>
      )}
    </div>
  )
}

interface RecordsTeaserResponse {
  drivers?: {
    mostWins?: { driver: { firstName: string; lastName: string }; count: number }[]
  }
}
