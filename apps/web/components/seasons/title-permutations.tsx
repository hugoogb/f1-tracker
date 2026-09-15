import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DriverAvatar } from '@/components/ui/driver-avatar'
import type { PermutationsResponse } from '@/lib/types'

interface TitlePermutationsProps {
  data: PermutationsResponse
}

function points(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

/**
 * Who can still win the drivers' title, and what the leader needs.
 *
 * Only rendered for a season with rounds left to run — for a finished season
 * the standings already answer the question.
 *
 * "Still in it" is the strict mathematical test: a driver is out only once
 * every remaining point could not carry them past the leader's current total.
 * That assumes the leader never scores again, so the list stays longer than
 * anyone's realistic shortlist. The copy says as much rather than implying
 * these are all live contenders.
 */
export function TitlePermutations({ data }: TitlePermutationsProps) {
  if (!data.started || data.seasonComplete) return null

  const alive = data.contenders.filter((c) => c.alive)
  const leader = data.contenders.find((c) => c.isLeader)
  if (!leader) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          Title permutations
          {data.decided ? (
            <Badge>Mathematically decided</Badge>
          ) : (
            <Badge variant="outline">{alive.length} still in it</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Rounds run" value={`${data.roundsRun} of ${data.totalRounds}`} />
          <Stat
            label="Races left"
            value={String(data.racesRemaining ?? 0)}
            hint={
              data.sprintsRemaining
                ? `+ ${data.sprintsRemaining} sprint${data.sprintsRemaining === 1 ? '' : 's'}`
                : undefined
            }
          />
          <Stat label="Points available" value={points(data.maxRemaining ?? 0)} />
          <Stat
            label={data.decided ? 'Champion' : 'Leads by'}
            value={
              data.decided
                ? (leader.driver.code ?? leader.driver.lastName)
                : points((data.contenders[1]?.deficit ?? 0) as number)
            }
          />
        </div>

        {!data.decided && data.nextRound && data.canClinchNextRound && (
          <p className="text-sm">
            <span className="font-medium">{leader.driver.lastName}</span> can seal it at round{' '}
            {data.nextRound.round} ({data.nextRound.name}) by taking maximum points there while the
            runner-up scores none.
          </p>
        )}

        {data.decided && (
          <p className="text-sm">
            Nobody else can reach {leader.driver.lastName} with {points(data.maxRemaining ?? 0)}{' '}
            points left, so the title is settled with {data.racesRemaining}{' '}
            {data.racesRemaining === 1 ? 'round' : 'rounds'} to spare.
          </p>
        )}

        <ul className="divide-border divide-y">
          {data.contenders.slice(0, 10).map((contender) => (
            <li
              key={contender.driver.ref}
              className={`flex items-center gap-3 py-2 ${contender.alive ? '' : 'opacity-45'}`}
            >
              <span className="text-muted-foreground w-5 text-sm tabular-nums">
                {contender.position}
              </span>
              <DriverAvatar
                firstName={contender.driver.firstName}
                lastName={contender.driver.lastName}
              />
              <span className="font-medium">{contender.driver.lastName}</span>
              {contender.onlyOnCountback && (
                <Badge variant="outline" className="text-xs">
                  Countback only
                </Badge>
              )}
              {!contender.alive && (
                <Badge variant="outline" className="text-xs">
                  Out
                </Badge>
              )}
              <span className="ml-auto text-sm tabular-nums">{points(contender.points)}</span>
              <span className="text-muted-foreground w-20 text-right text-xs tabular-nums">
                max {points(contender.maxPossible)}
              </span>
            </li>
          ))}
        </ul>

        <p className="text-muted-foreground text-xs">
          A driver counts as still in it until every remaining point could not take them past the
          leader&apos;s total today — which assumes the leader scores nothing for the rest of the
          year, so the list runs longer than the realistic one. Where two can only finish level, the
          title falls to a countback on wins, which no arithmetic here can project.
        </p>
      </CardContent>
    </Card>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border-border rounded-lg border bg-[var(--surface-1)] px-3 py-2">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  )
}
