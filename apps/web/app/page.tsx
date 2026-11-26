import Link from 'next/link'
import type { Metadata } from 'next'

import { api } from '@/lib/api'
import type {
  DriverStanding,
  ConstructorStanding,
  ConstructorPermutationsResponse,
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

export const revalidate = 3600

export const metadata: Metadata = {
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
  const constructorPermutations =
    permutations?.started && !permutations.seasonComplete
      ? await (
          api.seasons.constructorPermutations(
            latestYear,
          ) as Promise<ConstructorPermutationsResponse>
        ).catch(() => null)
      : null

  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  const startOf = (race: Race) => Date.parse(raceStart(race))
  const nextRace = races.find((r) => startOf(r) > now) ?? null
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
            teaser: `${latestChampion.driver.firstName} ${latestChampion.driver.lastName} is the reigning champion. Every title since 1950.`,
            href: '/champions',
            accent: latestChampion.driverConstructor?.color ?? null,
          },
        ]
      : []),
  ]

  return (
    <div className="space-y-14">
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
            <h1
              id="now-heading"
              className="font-data text-muted-foreground text-sm leading-normal font-semibold tracking-wider not-italic lg:text-sm"
            >
              Formula 1 stats, results and history since 1950
            </h1>
            <p className="font-display text-5xl leading-[0.9] font-extrabold uppercase italic lg:text-6xl">
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
            </p>
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

        <TitlePermutations drivers={permutations} constructors={constructorPermutations} />
      </section>

      {tiles.length > 0 && (
        <section aria-labelledby="explore-heading" className="space-y-4">
          <SectionHeader id="explore-heading" eyebrow="Beyond the standings" title="Explore" />
          <ExploreGrid tiles={tiles} />
        </section>
      )}

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
