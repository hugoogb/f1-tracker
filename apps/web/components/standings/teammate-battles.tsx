import Link from 'next/link'
import { getTeamColor } from '@/lib/utils'
import type { HeadToHeadTally, TeammatePairing, TeammateTeam } from '@/lib/types'

interface TeammateBattlesProps {
  teams: TeammateTeam[]
}

/** Below this a pairing is a stand-in drive, not a season-long battle. */
const MIN_SHARED_RACES = 3

function Battle({
  label,
  tally,
  color,
}: {
  label: string
  tally: HeadToHeadTally
  color: string | null
}) {
  const total = tally.a + tally.b
  const percentA = total === 0 ? 50 : (tally.a / total) * 100

  return (
    <div className="space-y-1.5">
      <div className="text-muted-foreground flex items-center justify-between text-xs">
        <span className="text-foreground font-medium tabular-nums">{tally.a}</span>
        <span>
          {label}
          {tally.compared > 0 && ` · ${tally.compared} compared`}
        </span>
        <span className="text-foreground font-medium tabular-nums">{tally.b}</span>
      </div>
      <div
        className="flex h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]"
        role="img"
        aria-label={`${label}: ${tally.a} to ${tally.b} over ${tally.compared} rounds`}
      >
        <div
          style={{ width: `${percentA}%`, backgroundColor: color ?? 'var(--primary)' }}
          className="h-full"
        />
        <div className="h-full flex-1 bg-[var(--surface-3,rgba(255,255,255,0.15))]" />
      </div>
    </div>
  )
}

function Pairing({ pairing, color }: { pairing: TeammatePairing; color: string | null }) {
  return (
    <div className="space-y-3 py-3">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <Link
          href={`/drivers/${pairing.a.driver.ref}`}
          className="hover:text-primary truncate font-medium transition-colors"
        >
          {pairing.a.driver.lastName}
        </Link>
        <span className="text-muted-foreground shrink-0 text-xs">
          {pairing.sharedRaces} races together
        </span>
        <Link
          href={`/drivers/${pairing.b.driver.ref}`}
          className="hover:text-primary truncate text-right font-medium transition-colors"
        >
          {pairing.b.driver.lastName}
        </Link>
      </div>

      <Battle label="Race" tally={pairing.race} color={color} />
      <Battle label="Qualifying" tally={pairing.qualifying} color={color} />

      <div className="text-muted-foreground flex items-center justify-between text-xs tabular-nums">
        <span>{pairing.a.points} pts</span>
        <span className="text-muted-foreground/70">Points for this team</span>
        <span>{pairing.b.points} pts</span>
      </div>
    </div>
  )
}

export function TeammateBattles({ teams }: TeammateBattlesProps) {
  const withBattles = teams
    .map((team) => ({
      ...team,
      pairings: team.pairings.filter((p) => p.sharedRaces >= MIN_SHARED_RACES),
    }))
    .filter((team) => team.pairings.length > 0)

  if (withBattles.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No teammate pairings with enough shared races in this season.
      </p>
    )
  }

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-sm">
        Same car, same season — the closest thing to a controlled comparison. Races where either
        driver retired are left out, since they say nothing about pace.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        {withBattles.map((team) => {
          const color = getTeamColor(team.constructor.ref, team.constructor.color)
          return (
            <section key={team.constructor.ref} className="glass rounded-xl p-4">
              <div className="mb-2 flex items-center gap-2">
                <span
                  className="h-4 w-1 rounded-full"
                  style={{ backgroundColor: color ?? 'var(--muted)' }}
                  aria-hidden
                />
                <Link
                  href={`/constructors/${team.constructor.ref}`}
                  className="hover:text-primary text-sm font-semibold transition-colors"
                >
                  {team.constructor.name}
                </Link>
              </div>
              <div className="divide-border divide-y">
                {team.pairings.map((pairing) => (
                  <Pairing
                    key={`${pairing.a.driver.ref}-${pairing.b.driver.ref}`}
                    pairing={pairing}
                    color={color}
                  />
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
