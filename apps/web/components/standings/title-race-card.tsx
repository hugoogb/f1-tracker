'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Trophy, Flag } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { getTeamColor } from '@/lib/utils'
import type {
  ConstructorTitleContender,
  DriverTitleContender,
  TitleRaceResponse,
} from '@/lib/types'

interface TitleRaceCardProps {
  data: TitleRaceResponse
}

type Championship = 'drivers' | 'constructors'

// Mid-season every competitor is still alive, which makes an uncapped list
// longer than the rest of the page.
const COLLAPSED_ROWS = 10

function ContenderRow({
  name,
  href,
  color,
  contender,
}: {
  name: string
  href: string
  color: string | null
  contender: DriverTitleContender | ConstructorTitleContender
}) {
  return (
    <li className="flex items-center gap-3 py-2">
      <span className="text-muted-foreground w-6 shrink-0 text-right text-xs tabular-nums">
        {contender.position ?? '—'}
      </span>
      <span
        className="h-5 w-1 shrink-0 rounded-full"
        style={{ backgroundColor: color ?? 'var(--muted)' }}
        aria-hidden
      />
      <Link href={href} className="hover:text-primary truncate text-sm transition-colors">
        {name}
      </Link>

      {contender.isLeader ? (
        <Badge variant="outline" className="ml-auto shrink-0 gap-1 text-[10px]">
          <Trophy className="h-3 w-3" />
          Leader
        </Badge>
      ) : contender.canWin ? (
        <span className="text-muted-foreground ml-auto shrink-0 text-xs tabular-nums">
          −{contender.gapToLeader}
        </span>
      ) : (
        <span className="text-muted-foreground/60 ml-auto shrink-0 text-xs">
          out by {contender.pointsNeeded}
        </span>
      )}

      <span className="w-14 shrink-0 text-right text-sm font-medium tabular-nums">
        {contender.points}
      </span>
    </li>
  )
}

export function TitleRaceCard({ data }: TitleRaceCardProps) {
  const [championship, setChampionship] = useState<Championship>('drivers')
  const [expanded, setExpanded] = useState(false)

  const table = championship === 'drivers' ? data.drivers : data.constructors
  const inContention = table.contenders.filter((c) => c.canWin)
  const eliminated = table.contenders.length - inContention.length
  const visible = expanded ? inContention : inContention.slice(0, COLLAPSED_ROWS)
  const hidden = inContention.length - visible.length

  return (
    <section className="glass space-y-4 rounded-xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-sm font-medium tracking-widest uppercase">
            <Flag className="h-3.5 w-3.5" />
            Title Race
          </h2>
          <p className="text-muted-foreground text-sm">
            {data.roundsRemaining} of {data.totalRounds} rounds remaining — up to{' '}
            <span className="text-foreground font-medium">{data.maxPointsRemaining}</span> points
            still available.
          </p>
        </div>

        <div className="border-border inline-flex rounded-lg border p-0.5 text-xs">
          {(
            [
              ['drivers', 'Drivers'],
              ['constructors', 'Constructors'],
            ] as const
          ).map(([value, labelText]) => (
            <button
              key={value}
              onClick={() => setChampionship(value)}
              aria-pressed={championship === value}
              className={`rounded-md px-2.5 py-1 transition-colors ${
                championship === value
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {labelText}
            </button>
          ))}
        </div>
      </div>

      {table.decided ? (
        <p className="text-sm">
          The {championship === 'drivers' ? "drivers'" : "constructors'"} championship is
          mathematically settled.
        </p>
      ) : (
        <p className="text-muted-foreground text-sm">
          <span className="text-foreground font-medium">{inContention.length}</span> can still win
          it{eliminated > 0 && `, ${eliminated} mathematically eliminated`}.
        </p>
      )}

      <ul className="divide-border divide-y">
        {championship === 'drivers'
          ? (visible as DriverTitleContender[]).map((c) => (
              <ContenderRow
                key={c.driver.ref}
                name={`${c.driver.firstName} ${c.driver.lastName}`}
                href={`/drivers/${c.driver.ref}`}
                color={c.constructor ? getTeamColor(c.constructor.ref, c.constructor.color) : null}
                contender={c}
              />
            ))
          : (visible as ConstructorTitleContender[]).map((c) => (
              <ContenderRow
                key={c.constructor.ref}
                name={c.constructor.name}
                href={`/constructors/${c.constructor.ref}`}
                color={getTeamColor(c.constructor.ref, c.constructor.color)}
                contender={c}
              />
            ))}
      </ul>

      {(hidden > 0 || expanded) && (
        <button
          onClick={() => setExpanded((prev) => !prev)}
          className="text-muted-foreground hover:text-foreground text-xs transition-colors"
        >
          {expanded ? 'Show fewer' : `Show ${hidden} more`}
        </button>
      )}

      <p className="text-muted-foreground text-xs">
        A competitor is counted out only when winning everything left still leaves them behind the
        current leader, who is assumed to score nothing. Each remaining round is valued at{' '}
        {data.maxPointsPerRound} points — a win plus
        {data.sprintPointsForWin > 0 ? ' a sprint win' : ' any bonus'}
        {data.sprintPointsForWin > 0 &&
          ', since which future rounds carry a sprint is not published in the data'}
        .
      </p>
    </section>
  )
}
