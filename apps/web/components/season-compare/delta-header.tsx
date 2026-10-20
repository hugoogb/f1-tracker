import Link from 'next/link'
import { ArrowLeftRight } from 'lucide-react'
import type { SeasonCompareResponse } from '@/lib/types'
import { AnimatedNumber } from '@/components/ui/motion'
import { Badge } from '@/components/ui/badge'
import { formatPoints, type SideInfo } from './sides'

/**
 * The headline: who leads on points and by how much, in the leader's colour.
 */
export function DeltaHeader({
  data,
  sides,
  swapHref,
}: {
  data: SeasonCompareResponse
  sides: [SideInfo, SideInfo]
  swapHref: string
}) {
  const [a, b] = sides
  const points = data.aggregates.points
  const delta = points.delta ?? 0
  const leader = delta > 0 ? a : delta < 0 ? b : null
  const rounds = data.roundsRaced

  return (
    <div className="glass relative overflow-hidden rounded-xl px-6 py-8">
      {leader && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-1"
          style={{ backgroundColor: leader.color }}
        />
      )}
      <div className="grid items-center gap-6 md:grid-cols-[1fr_auto_1fr]">
        <SideName side={a} points={points.a ?? 0} align="right" />

        <div className="flex flex-col items-center text-center">
          <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
            {leader
              ? `${leader.short} ${data.type === 'drivers' ? 'leads' : 'lead'} by`
              : 'Level on points'}
          </p>
          <p
            className="font-heading text-6xl leading-none font-bold tabular-nums"
            style={leader ? { color: leader.color } : undefined}
          >
            {Number.isInteger(delta) ? (
              <AnimatedNumber value={Math.abs(delta)} />
            ) : (
              formatPoints(Math.abs(delta))
            )}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            points after {rounds} {rounds === 1 ? 'round' : 'rounds'}
          </p>
          {data.pointsSource === 'results' && (
            <Badge variant="outline" className="mt-2">
              No official table this season — summed from results
            </Badge>
          )}
        </div>

        <SideName side={b} points={points.b ?? 0} align="left" />
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        {data.teammates?.sameTeam && (
          <Badge variant="secondary">
            Teammates at {data.teammates.constructor?.name} · {data.teammates.sharedRounds} rounds
          </Badge>
        )}
        <Link
          href={swapHref}
          className="border-border inline-flex h-8 items-center gap-1.5 rounded-lg border bg-[var(--surface-1)] px-2.5 text-sm font-medium transition-all hover:bg-[var(--surface-2)]"
        >
          <ArrowLeftRight className="h-3.5 w-3.5" />
          Swap sides
        </Link>
      </div>
    </div>
  )
}

function SideName({
  side,
  points,
  align,
}: {
  side: SideInfo
  points: number
  align: 'left' | 'right'
}) {
  return (
    <div className={align === 'right' ? 'text-center md:text-right' : 'text-center md:text-left'}>
      <div
        className={
          align === 'right'
            ? 'flex items-center justify-center gap-2 md:justify-end'
            : 'flex items-center justify-center gap-2 md:justify-start'
        }
      >
        <span
          className="inline-block size-3 shrink-0 rounded-full"
          style={{ backgroundColor: side.color }}
        />
        <Link
          href={side.href}
          className="font-heading text-2xl font-bold transition-colors hover:opacity-80"
        >
          {side.name}
        </Link>
      </div>
      <p className="text-muted-foreground mt-1 text-sm tabular-nums">{formatPoints(points)} pts</p>
    </div>
  )
}
