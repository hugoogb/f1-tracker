'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import type { BestSeason } from '@/lib/types'
import { cn, teamColorOf } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { PositionBadge } from '@/components/ui/position-badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ScoreBreakdownBar } from './score-breakdown-bar'
import { deciderLabel, formatPoints, formatShare } from './format'
import type { ChartEra } from './competitiveness-chart'

type SortKey =
  | 'score'
  | 'year'
  | 'margin'
  | 'decided'
  | 'finale'
  | 'winners'
  | 'poles'
  | 'leads'
  | 'constructors'

type Order = 'asc' | 'desc'

/**
 * Each sortable column: how to read its value, and which way "best" points when
 * the column is first clicked — a small margin and a late decider are the
 * exciting ends, so those open ascending.
 */
const COLUMNS: Record<SortKey, { value: (s: BestSeason) => number | null; first: Order }> = {
  score: { value: (s) => s.score.total, first: 'desc' },
  year: { value: (s) => s.year, first: 'desc' },
  margin: { value: (s) => s.titleMarginShare, first: 'asc' },
  decided: { value: (s) => s.decidedRoundsFromEnd, first: 'asc' },
  finale: { value: (s) => s.contendersAtFinale, first: 'desc' },
  winners: { value: (s) => s.distinctWinners, first: 'desc' },
  poles: { value: (s) => s.distinctPoleSitters, first: 'desc' },
  leads: { value: (s) => s.leadChanges, first: 'desc' },
  constructors: { value: (s) => s.constructors?.marginShare ?? null, first: 'asc' },
}

const ALL = 'all'

function isSortKey(value: string | null): value is SortKey {
  return value !== null && value in COLUMNS
}

/**
 * The full ranking, sorted and filtered in the browser.
 *
 * Every completed season arrives with the page, so nothing here fetches. The
 * opening state is read once from the query string and every change is mirrored
 * back with `history.replaceState`, the same way the records explorer keeps a
 * view linkable without the page reading `searchParams` — which is what keeps
 * the route in the full route cache.
 */
export function BestSeasonsTable({ seasons, eras }: { seasons: BestSeason[]; eras: ChartEra[] }) {
  const searchParams = useSearchParams()
  const [state, setState] = useState(() => {
    const sort = searchParams.get('sort')
    const order = searchParams.get('order')
    const era = searchParams.get('era')
    return {
      sort: isSortKey(sort) ? sort : ('score' as SortKey),
      order: order === 'asc' || order === 'desc' ? (order as Order) : null,
      era: era && eras.some((e) => e.id === era) ? era : '',
      finalRoundOnly: searchParams.get('final') === '1',
    }
  })
  const order: Order = state.order ?? COLUMNS[state.sort].first

  useEffect(() => {
    const query = new URLSearchParams()
    if (state.sort !== 'score') query.set('sort', state.sort)
    if (state.order) query.set('order', state.order)
    if (state.era) query.set('era', state.era)
    if (state.finalRoundOnly) query.set('final', '1')
    const qs = query.toString()
    window.history.replaceState(
      null,
      '',
      qs ? `${window.location.pathname}?${qs}` : window.location.pathname,
    )
  }, [state])

  const rows = useMemo(() => {
    const era = eras.find((e) => e.id === state.era)
    const filtered = seasons.filter(
      (s) =>
        (!era || (s.year >= era.from && s.year <= era.to)) &&
        (!state.finalRoundOnly || s.wentToFinalRound),
    )
    const read = COLUMNS[state.sort].value
    const present = filtered.filter((s) => read(s) !== null)
    const missing = filtered.filter((s) => read(s) === null)
    present.sort((a, b) => {
      const diff = (read(a) as number) - (read(b) as number)
      return (order === 'asc' ? diff : -diff) || b.year - a.year
    })
    // Seasons without a value for the column (no constructors' title before
    // 1958) always go last, whichever way the column is sorted.
    return [...present, ...missing]
  }, [seasons, eras, state, order])

  const sortBy = (key: SortKey) =>
    setState((current) =>
      current.sort === key
        ? {
            ...current,
            order: (current.order ?? COLUMNS[key].first) === 'asc' ? 'desc' : 'asc',
          }
        : { ...current, sort: key, order: null },
    )

  const header = (key: SortKey, label: string, className?: string) => {
    const active = state.sort === key
    const Icon = !active ? ArrowUpDown : order === 'asc' ? ArrowUp : ArrowDown
    return (
      <TableHead
        className={cn('whitespace-nowrap', className)}
        aria-sort={active ? (order === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        <button
          type="button"
          onClick={() => sortBy(key)}
          className={cn(
            'inline-flex items-center gap-1 transition-colors',
            active ? 'text-foreground' : 'hover:text-foreground',
          )}
        >
          {label}
          <Icon className={cn('h-3 w-3', !active && 'opacity-40')} />
        </button>
      </TableHead>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <span className="text-muted-foreground block text-xs font-medium">Points-system era</span>
          <Select
            value={state.era || ALL}
            onValueChange={(value: string | null) =>
              setState((current) => ({ ...current, era: !value || value === ALL ? '' : value }))
            }
          >
            <SelectTrigger className="w-[220px]" aria-label="Points-system era">
              <SelectValue>
                {(value: string | null) => {
                  const match = eras.find((era) => era.id === value)
                  return match ? `${match.label}` : 'All seasons'
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All seasons</SelectItem>
              {eras.map((era) => (
                <SelectItem key={era.id} value={era.id}>
                  {era.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          size="sm"
          variant={state.finalRoundOnly ? 'default' : 'outline'}
          aria-pressed={state.finalRoundOnly}
          onClick={() =>
            setState((current) => ({ ...current, finalRoundOnly: !current.finalRoundOnly }))
          }
        >
          Went to the final round
        </Button>
        <p className="text-muted-foreground ml-auto text-xs tabular-nums">
          {rows.length} season{rows.length === 1 ? '' : 's'}
        </p>
      </div>

      <Table aria-label="Every season ranked by competitiveness">
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">#</TableHead>
            {header('year', 'Season')}
            <TableHead>Champion vs rival</TableHead>
            {header('margin', 'Margin', 'text-right')}
            {header('decided', 'Decided', 'text-right')}
            {header('finale', 'Finale', 'text-right')}
            {header('winners', 'Winners', 'text-right')}
            {header('poles', 'Poles', 'text-right')}
            {header('leads', 'Lead changes', 'text-right')}
            {header('constructors', "Constructors'", 'text-right')}
            {header('score', 'Score', 'min-w-[160px]')}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((s) => (
            <TableRow key={s.year}>
              <TableCell>
                {s.rank !== null && <PositionBadge position={s.rank} size="sm" />}
              </TableCell>
              <TableCell>
                <Link
                  href={`/seasons/${s.year}`}
                  className="display hover:text-primary text-base tabular-nums transition-colors"
                >
                  {s.year}
                </Link>
              </TableCell>
              <TableCell className="min-w-[220px]">
                {s.champion && (
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="h-7 w-1 shrink-0"
                      style={{
                        backgroundColor: teamColorOf(s.champion.constructor?.color) ?? undefined,
                      }}
                    />
                    <div className="min-w-0 leading-tight">
                      <Link
                        href={`/drivers/${s.champion.driver.ref}`}
                        className="hover:text-primary font-medium transition-colors"
                      >
                        {s.champion.driver.firstName} {s.champion.driver.lastName}
                      </Link>
                      {s.runnerUp && (
                        <p className="text-muted-foreground text-xs">
                          vs {s.runnerUp.driver.firstName} {s.runnerUp.driver.lastName}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </TableCell>
              <TableCell className="text-right whitespace-nowrap">
                <span className="font-data tabular-nums">{formatPoints(s.titleMargin)}</span>
                <span className="text-muted-foreground block text-xs tabular-nums">
                  {formatShare(s.titleMarginShare)}
                </span>
              </TableCell>
              <TableCell className="text-right whitespace-nowrap">
                <span
                  className={cn('tabular-nums', s.wentToFinalRound && 'text-primary font-medium')}
                >
                  {deciderLabel(s)}
                </span>
                {s.progressionApproximate && (
                  <span
                    className="text-muted-foreground ml-0.5"
                    title="Approximate: a round of this season has no official table"
                  >
                    *
                  </span>
                )}
              </TableCell>
              <TableCell className="font-data text-right tabular-nums">
                {s.contendersAtFinale ?? '—'}
              </TableCell>
              <TableCell className="font-data text-right tabular-nums">
                {s.distinctWinners}
              </TableCell>
              <TableCell className="font-data text-right tabular-nums">
                {s.distinctPoleSitters ?? '—'}
              </TableCell>
              <TableCell className="font-data text-right tabular-nums">{s.leadChanges}</TableCell>
              <TableCell className="text-right whitespace-nowrap">
                {s.constructors ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className="inline-block size-2"
                      style={{
                        backgroundColor: teamColorOf(s.constructors.champion?.color) ?? undefined,
                      }}
                    />
                    <span className="font-data tabular-nums">
                      {formatPoints(s.constructors.margin)}
                    </span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-3">
                  <span className="display w-10 text-right text-base tabular-nums">
                    {s.score.total.toFixed(1)}
                  </span>
                  <ScoreBreakdownBar components={s.score.components} className="min-w-[100px]" />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.some((s) => s.progressionApproximate) && (
        <p className="text-muted-foreground text-xs">
          * A round of this season has no official championship table, so its round-by-round figures
          follow points scored rather than points counted and are approximate. Champions and margins
          are always the official ones.
        </p>
      )}
    </div>
  )
}
