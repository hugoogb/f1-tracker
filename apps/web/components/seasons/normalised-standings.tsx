'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { PositionBadge } from '@/components/ui/position-badge'
import type { NormalisedStandingsResponse } from '@/lib/types'

interface NormalisedStandingsProps {
  /** One re-scored table per points system, in era order. */
  results: NormalisedStandingsResponse[]
  year: number
}

function points(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function DeltaCell({ delta }: { delta: number | null }) {
  if (delta === null) {
    return <span className="text-muted-foreground text-xs">—</span>
  }
  if (delta === 0) {
    return (
      <span className="text-muted-foreground inline-flex items-center gap-0.5 text-xs">
        <Minus className="size-3" aria-hidden />
        <span className="sr-only">No change</span>
      </span>
    )
  }
  const gained = delta > 0
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs tabular-nums ${
        gained ? 'text-[var(--pos-gain,#22c55e)]' : 'text-[var(--pos-loss,#ef4444)]'
      }`}
    >
      {gained ? (
        <ArrowUp className="size-3" aria-hidden />
      ) : (
        <ArrowDown className="size-3" aria-hidden />
      )}
      {Math.abs(delta)}
      <span className="sr-only">
        {gained ? `up ${delta} places` : `down ${Math.abs(delta)} places`}
      </span>
    </span>
  )
}

/**
 * The same season scored under every points system the sport has used.
 *
 * Each table is rendered on the server and switched here, so changing system is
 * instant and the page stays cacheable — a query parameter would make the whole
 * season route dynamic for one control.
 *
 * The framing matters as much as the numbers. This answers "who scored most
 * under these rules", not "who would have won": nobody would have driven the
 * same season under different scoring. The note under the table spells out what
 * is not modelled, chiefly the dropped-scores rules that make the pre-1991
 * official tables differ from the sum of their races.
 */
export function NormalisedStandings({ results, year }: NormalisedStandingsProps) {
  const available = useMemo(() => results.filter((r) => r.standings.length > 0), [results])
  const actual = available.find((r) => r.isActualSystem)
  const [selectedId, setSelectedId] = useState(
    () => actual?.system.id ?? available[0]?.system.id ?? '',
  )

  const selected = available.find((r) => r.system.id === selectedId) ?? available[0]

  if (!selected) {
    return <p className="text-muted-foreground text-sm">No results for {year} to re-score.</p>
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium">Score this season under another era&apos;s rules</h3>
        <p className="text-muted-foreground mt-1 text-sm">
          {year} actually ran on {selected.actualSystem.label} ({selected.actualSystem.era}).
        </p>
      </div>

      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <div className="flex w-max gap-2" role="group" aria-label="Points system">
          {available.map((result) => {
            const on = result.system.id === selected.system.id
            return (
              <button
                key={result.system.id}
                onClick={() => setSelectedId(result.system.id)}
                aria-pressed={on}
                className={`rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap transition-all ${
                  on
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {result.system.era}
                {result.isActualSystem && ' ·  actual'}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="font-mono text-xs">
          {selected.system.label}
        </Badge>
        {selected.championChanged && <Badge>Different champion</Badge>}
        {selected.isActualSystem && <Badge variant="outline">The season&apos;s own rules</Badge>}
      </div>

      {selected.system.notes && (
        <p className="text-muted-foreground text-sm">{selected.system.notes}</p>
      )}

      <Table aria-label={`${year} standings under ${selected.system.era} points`}>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">Pos</TableHead>
            <TableHead>Driver</TableHead>
            <TableHead className="text-right">Points</TableHead>
            <TableHead className="hidden text-right sm:table-cell">Wins</TableHead>
            <TableHead className="text-right">Official</TableHead>
            <TableHead className="w-16 text-right">Change</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {selected.standings.slice(0, 20).map((row) => (
            <TableRow key={row.driver.ref}>
              <TableCell>
                <PositionBadge position={row.position} />
              </TableCell>
              <TableCell>
                <Link
                  href={`/drivers/${row.driver.ref}`}
                  className="hover:text-primary font-medium transition-colors"
                >
                  {row.driver.firstName} {row.driver.lastName}
                </Link>
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {points(row.points)}
              </TableCell>
              <TableCell className="hidden text-right tabular-nums sm:table-cell">
                {row.wins}
              </TableCell>
              <TableCell className="text-muted-foreground text-right tabular-nums">
                {row.officialPosition ?? '—'}
                {row.officialPoints !== null && (
                  <span className="hidden sm:inline"> ({points(row.officialPoints)})</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                <DeltaCell delta={row.positionDelta} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <p className="text-muted-foreground text-xs">
        A hypothetical, not a record. Every result is scored, which is the only way two eras compare
        on the same basis — but until 1990 just a driver&apos;s best few results counted towards the
        title, so the official table for those seasons is not the sum of their races. Half-points
        races and shared drives are not modelled either. And nobody would have driven the same
        season under different rules.
      </p>
    </div>
  )
}
