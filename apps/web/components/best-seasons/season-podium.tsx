import Link from 'next/link'
import { Crown, Flag, Swords, Trophy, Users } from 'lucide-react'
import type { BestSeason } from '@/lib/types'
import { cn, teamColorOf } from '@/lib/utils'
import { MotionCard, StaggerItem, StaggerList } from '@/components/ui/motion'
import { ScoreBreakdownBar } from './score-breakdown-bar'
import { deciderSentence, formatPoints } from './format'

/**
 * The three greatest title fights, arranged as a podium: first in the middle and
 * raised, second and third either side. On a phone they simply stack in rank
 * order, because a podium three cards wide does not fit.
 */
export function SeasonPodium({ seasons }: { seasons: BestSeason[] }) {
  const top = seasons.slice(0, 3)
  if (top.length === 0) return null
  // Desktop order 2-1-3; `order-*` keeps the DOM (and the phone layout) in rank order.
  const desktopOrder = ['md:order-2', 'md:order-1', 'md:order-3']

  return (
    <StaggerList className="grid items-end gap-4 md:grid-cols-3">
      {top.map((season, i) => (
        <StaggerItem key={season.year} className={desktopOrder[i]}>
          <PodiumCard season={season} place={i + 1} />
        </StaggerItem>
      ))}
    </StaggerList>
  )
}

function PodiumCard({ season, place }: { season: BestSeason; place: number }) {
  const accent = teamColorOf(season.champion?.constructor?.color)
  const rivalColor = teamColorOf(season.runnerUp?.constructor?.color)
  const first = place === 1

  return (
    <Link href={`/seasons/${season.year}`} className="block">
      <MotionCard>
        <div
          className={cn(
            'relative overflow-hidden rounded-2xl border bg-[var(--surface-1)] p-5 shadow-xl shadow-black/30 backdrop-blur-md transition-colors',
            first
              ? 'border-primary/40 card-glow md:pb-10'
              : 'hover:border-primary/30 border-[oklch(1_0_0/6%)]',
          )}
        >
          {/* The champion's team colour as a wash from the top edge. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-24 opacity-25"
            style={{ background: `linear-gradient(to bottom, ${accent}, transparent)` }}
          />
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 h-1"
            style={{ backgroundColor: accent ?? undefined }}
          />

          <div className="relative flex items-start justify-between gap-3">
            <div>
              <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase">
                {first ? (
                  <Crown className="text-primary h-3.5 w-3.5" />
                ) : (
                  <Trophy className="h-3.5 w-3.5" />
                )}
                #{place} greatest season
              </p>
              <p
                className={cn(
                  'font-heading mt-1 leading-none font-bold tabular-nums',
                  first ? 'text-6xl' : 'text-5xl',
                )}
              >
                {season.year}
              </p>
            </div>
            <div className="text-right">
              <p className="font-heading text-3xl font-bold tabular-nums">
                {season.score.total.toFixed(1)}
              </p>
              <p className="text-muted-foreground text-[10px] tracking-wider uppercase">
                score / 100
              </p>
            </div>
          </div>

          {season.champion && (
            <div className="relative mt-5 space-y-2">
              <ContenderLine
                label="Champion"
                name={`${season.champion.driver.firstName} ${season.champion.driver.lastName}`}
                team={season.champion.constructor?.name}
                color={accent}
                points={season.champion.points}
                strong
              />
              {season.runnerUp && (
                <ContenderLine
                  label="Rival"
                  name={`${season.runnerUp.driver.firstName} ${season.runnerUp.driver.lastName}`}
                  team={season.runnerUp.constructor?.name}
                  color={rivalColor}
                  points={season.runnerUp.points}
                />
              )}
            </div>
          )}

          <dl className="relative mt-5 grid grid-cols-3 gap-2 text-center">
            <Fact icon={Swords} label="Margin" value={`${formatPoints(season.titleMargin)} pts`} />
            <Fact icon={Users} label="At finale" value={String(season.contendersAtFinale ?? '—')} />
            <Fact icon={Flag} label="Winners" value={String(season.distinctWinners)} />
          </dl>

          <p className="text-muted-foreground relative mt-4 text-xs">
            {deciderSentence(season)}
            {season.decidedAtRace && season.wentToFinalRound ? ` — ${season.decidedAtRace}` : ''}
          </p>
          <ScoreBreakdownBar components={season.score.components} className="relative mt-3" />
        </div>
      </MotionCard>
    </Link>
  )
}

function ContenderLine({
  label,
  name,
  team,
  color,
  points,
  strong = false,
}: {
  label: string
  name: string
  team?: string
  color: string | null
  points: number
  strong?: boolean
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        aria-hidden
        className="h-8 w-1 shrink-0 rounded-full"
        style={{ backgroundColor: color ?? undefined }}
      />
      <div className="min-w-0 flex-1">
        <p className="text-muted-foreground text-[10px] tracking-wider uppercase">{label}</p>
        <p className={cn('truncate', strong ? 'font-semibold' : 'text-sm')}>
          {name}
          {team && <span className="text-muted-foreground text-xs font-normal"> · {team}</span>}
        </p>
      </div>
      <span className="font-mono text-sm tabular-nums">{formatPoints(points)}</span>
    </div>
  )
}

function Fact({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg)] px-2 py-2">
      <dt className="text-muted-foreground flex items-center justify-center gap-1 text-[10px] tracking-wider uppercase">
        <Icon className="h-3 w-3" />
        {label}
      </dt>
      <dd className="font-heading mt-0.5 text-lg font-bold tabular-nums">{value}</dd>
    </div>
  )
}
