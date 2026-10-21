import Link from 'next/link'
import { liveryStyle } from '@/lib/livery'
import { api } from '@/lib/api'
import type { SeasonChampion } from '@/lib/types'
import { PageHero } from '@/components/ui/page-hero'
import { FadeIn, StaggerList, StaggerItem, MotionCard } from '@/components/ui/motion'
import { teamColorOf } from '@/lib/utils'
import { buildMetadata } from '@/lib/seo'

export const metadata = buildMetadata({
  title: 'Seasons',
  description:
    'Browse every Formula 1 season from 1950 to today — race calendars, driver and constructor standings, and championship progression.',
  path: '/seasons',
})

function groupByDecade(seasons: { year: number }[]) {
  const groups: Record<string, number[]> = {}

  for (const { year } of seasons) {
    const decade = `${Math.floor(year / 10) * 10}s`
    if (!groups[decade]) groups[decade] = []
    groups[decade].push(year)
  }

  return Object.entries(groups).sort(([a], [b]) => parseInt(b) - parseInt(a))
}

export default async function SeasonsPage() {
  // The champion list is what turns this page from a wall of years into
  // something worth reading, but it must not be able to take the page down.
  const [seasonsResult, championsResult] = await Promise.allSettled([
    api.seasons.list(),
    api.champions() as Promise<{ data: SeasonChampion[] }>,
  ])

  if (seasonsResult.status === 'rejected') throw seasonsResult.reason

  const seasons = seasonsResult.value.data
  const champions = championsResult.status === 'fulfilled' ? championsResult.value.data : []
  const championByYear = new Map(champions.map((c) => [c.year, c]))

  const decades = groupByDecade(seasons)
  const latestYear = seasons[0]?.year

  return (
    <div className="space-y-10">
      <PageHero
        eyebrow={`Archive · 1950–${latestYear ?? ''}`}
        title="Seasons"
        description="Every Formula 1 season from 1950 to today."
      />

      {decades.map(([decade, years], i) => (
        <FadeIn key={decade} delay={Math.min(i * 0.05, 0.2)}>
          <section>
            <div className="border-hairline mb-4 flex items-center gap-3 border-b pb-2">
              <span aria-hidden className="bg-primary h-5 w-1 -skew-x-12" />
              <h2>{decade}</h2>
            </div>
            <StaggerList className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {years.map((year) => (
                <StaggerItem key={year}>
                  <SeasonCard
                    year={year}
                    champion={championByYear.get(year)}
                    isLatest={year === latestYear}
                  />
                </StaggerItem>
              ))}
            </StaggerList>
          </section>
        </FadeIn>
      ))}
    </div>
  )
}

/**
 * One season tile.
 *
 * Every tile has the same two rows — year, then champion — so the grid keeps a
 * single height. That is deliberate: the old layout appended a "Current" badge
 * to one card, which made its row taller than every other row on the page. The
 * in-progress season now says so in the row the champion would occupy, and its
 * accent comes from the border and a dot, neither of which takes up space.
 */
function SeasonCard({
  year,
  champion,
  isLatest,
}: {
  year: number
  champion?: SeasonChampion
  isLatest: boolean
}) {
  // No champion for the season still being raced, and none recorded for a few
  // early seasons; both get a status line rather than an empty one.
  const inProgress = isLatest && !champion
  const accent = teamColorOf(champion?.constructor?.color, null)

  return (
    <Link href={`/seasons/${year}`} prefetch={false} className="block">
      <MotionCard>
        <div
          style={liveryStyle(accent)}
          className={`group bg-surface-1 brackets relative border px-4 py-3 transition-colors duration-200 ${
            inProgress ? 'border-primary/60' : 'border-hairline hover:bg-surface-2'
          }`}
        >
          {/* Champion's team colour, as a rail rather than a block of colour. */}
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 w-0.5"
            style={{ backgroundColor: accent ?? 'transparent' }}
          />

          <div className="flex items-baseline justify-between gap-2">
            <span className="display text-3xl tabular-nums">{year}</span>
            {inProgress && (
              <span
                aria-hidden
                className="bg-primary size-1.5 shrink-0 motion-safe:animate-pulse"
                title="Season in progress"
              />
            )}
          </div>

          <p className="text-muted-foreground mt-0.5 truncate text-xs">
            {inProgress ? (
              <span className="text-primary">In progress</span>
            ) : champion ? (
              <>
                {champion.driver.lastName}
                {champion.constructor && (
                  <span className="opacity-60"> · {champion.constructor.name}</span>
                )}
              </>
            ) : (
              'No champion recorded'
            )}
          </p>
        </div>
      </MotionCard>
    </Link>
  )
}
