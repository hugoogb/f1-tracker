import Link from 'next/link'
import { Trophy } from 'lucide-react'
import { api } from '@/lib/api'
import type { SeasonChampion } from '@/lib/types'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChampionsTabs } from './champions-tabs'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Champions | F1 Tracker',
  description: 'Formula 1 World Champions throughout history',
}

function groupByDecade<T extends { year: number }>(items: T[]) {
  const groups: Record<string, T[]> = {}
  for (const item of items) {
    const decade = `${Math.floor(item.year / 10) * 10}s`
    ;(groups[decade] ??= []).push(item)
  }
  return Object.entries(groups).sort(([a], [b]) => parseInt(b) - parseInt(a))
}

function countDriverTitles(champions: SeasonChampion[]) {
  const counts: Record<string, number> = {}
  for (const c of champions) {
    counts[c.driver.ref] = (counts[c.driver.ref] ?? 0) + 1
  }
  return counts
}

function countConstructorTitles(champions: SeasonChampion[]) {
  const counts: Record<string, number> = {}
  for (const c of champions) {
    if (c.constructor) {
      counts[c.constructor.ref] = (counts[c.constructor.ref] ?? 0) + 1
    }
  }
  return counts
}

export default async function ChampionsPage() {
  const { data: champions } = (await api.champions()) as {
    data: SeasonChampion[]
  }

  const driverDecades = groupByDecade(champions)
  const driverTitleCounts = countDriverTitles(champions)

  const constructorChampions = champions.filter((c) => c.constructor != null)
  const constructorDecades = groupByDecade(constructorChampions)
  const constructorTitleCounts = countConstructorTitles(champions)

  return (
    <div className="space-y-10">
      <PageHeader
        title="Champions"
        description="F1 World Champions from every season"
        badge={
          <Badge variant="secondary" className="font-mono">
            {champions.length} seasons
          </Badge>
        }
      />

      <ChampionsTabs
        driversContent={
          <div className="space-y-10">
            {driverDecades.map(([decade, entries]) => (
              <section key={decade}>
                <div className="mb-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary/20 h-6 w-1 rounded-full" />
                    <h2>{decade}</h2>
                  </div>
                  <div className="accent-line" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {entries.map((champion) => {
                    const titles = driverTitleCounts[champion.driver.ref] ?? 0
                    const teamColor = champion.constructor?.color ?? null
                    return (
                      <Card
                        key={champion.year}
                        className="relative overflow-hidden transition-all duration-200 hover:-translate-y-0.5"
                      >
                        {teamColor && (
                          <div
                            className="absolute top-0 left-0 h-full w-1 rounded-l-2xl"
                            style={{ backgroundColor: teamColor }}
                          />
                        )}
                        <CardContent className="flex items-start gap-4 px-5 py-4">
                          <div className="flex flex-col items-center gap-1">
                            <Link
                              href={`/seasons/${champion.year}`}
                              className="font-heading hover:text-primary text-lg font-bold transition-colors"
                            >
                              {champion.year}
                            </Link>
                            <Trophy className="h-4 w-4 text-amber-500/60" />
                          </div>
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <Link
                                href={`/drivers/${champion.driver.ref}`}
                                className="hover:text-primary truncate font-medium transition-colors"
                              >
                                {champion.driver.firstName} {champion.driver.lastName}
                              </Link>
                              {titles > 1 && (
                                <Badge variant="outline" className="shrink-0 text-xs">
                                  {titles}x
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center justify-between">
                              {champion.constructor ? (
                                <Link
                                  href={`/constructors/${champion.constructor.ref}`}
                                  className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
                                >
                                  {champion.constructor.color && (
                                    <span
                                      className="inline-block size-2.5 rounded-full"
                                      style={{ backgroundColor: champion.constructor.color }}
                                    />
                                  )}
                                  {champion.constructor.name}
                                </Link>
                              ) : (
                                <span className="text-muted-foreground text-sm">—</span>
                              )}
                              <span className="text-muted-foreground text-sm tabular-nums">
                                {champion.driverPoints} pts
                              </span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        }
        constructorsContent={
          <div className="space-y-10">
            {constructorDecades.map(([decade, entries]) => (
              <section key={decade}>
                <div className="mb-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary/20 h-6 w-1 rounded-full" />
                    <h2>{decade}</h2>
                  </div>
                  <div className="accent-line" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {entries.map((champion) => {
                    const titles = constructorTitleCounts[champion.constructor!.ref] ?? 0
                    const teamColor = champion.constructor!.color ?? null
                    return (
                      <Card
                        key={champion.year}
                        className="relative overflow-hidden transition-all duration-200 hover:-translate-y-0.5"
                      >
                        {teamColor && (
                          <div
                            className="absolute top-0 left-0 h-full w-1 rounded-l-2xl"
                            style={{ backgroundColor: teamColor }}
                          />
                        )}
                        <CardContent className="flex items-start gap-4 px-5 py-4">
                          <div className="flex flex-col items-center gap-1">
                            <Link
                              href={`/seasons/${champion.year}`}
                              className="font-heading hover:text-primary text-lg font-bold transition-colors"
                            >
                              {champion.year}
                            </Link>
                            <Trophy className="h-4 w-4 text-amber-500/60" />
                          </div>
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <Link
                                href={`/constructors/${champion.constructor!.ref}`}
                                className="hover:text-primary inline-flex items-center gap-1.5 truncate font-medium transition-colors"
                              >
                                {champion.constructor!.color && (
                                  <span
                                    className="inline-block size-2.5 shrink-0 rounded-full"
                                    style={{ backgroundColor: champion.constructor!.color }}
                                  />
                                )}
                                {champion.constructor!.name}
                              </Link>
                              {titles > 1 && (
                                <Badge variant="outline" className="shrink-0 text-xs">
                                  {titles}x
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center justify-between">
                              <Link
                                href={`/drivers/${champion.driver.ref}`}
                                className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                              >
                                {champion.driver.firstName} {champion.driver.lastName}
                              </Link>
                              <span className="text-muted-foreground text-sm tabular-nums">
                                {champion.constructorPoints} pts
                              </span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        }
      />
    </div>
  )
}
