import Link from 'next/link'
import type { SeasonCompareResponse, SeasonCompareRoundSide } from '@/lib/types'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DeltaChip } from './delta-chip'
import { formatPoints, type SideInfo } from './sides'

function finishText(side: SeasonCompareRoundSide, perCar: boolean): string {
  if (!side.entered) return '—'
  if (perCar) return side.bestFinish != null ? `P${side.bestFinish}` : 'DNF'
  if (side.finish != null) return `P${side.finish}`
  return side.positionText ?? '—'
}

function gridText(side: SeasonCompareRoundSide, perCar: boolean): string {
  const grid = perCar ? side.bestGrid : side.grid
  return side.entered && grid ? `P${grid}` : '—'
}

function carsTitle(side: SeasonCompareRoundSide): string | undefined {
  if (!side.drivers?.length) return undefined
  return side.drivers
    .map(
      (d) => `${d.code ?? d.lastName}: ${d.position ? `P${d.position}` : (d.positionText ?? '—')}`,
    )
    .join(' · ')
}

/**
 * Round-by-round finishes, grids and points with A − B deltas. For constructors
 * a cell is the team's best car; hovering it lists every car.
 */
export function RoundsTable({
  data,
  sides,
}: {
  data: SeasonCompareResponse
  sides: [SideInfo, SideInfo]
}) {
  const [a, b] = sides
  const perCar = data.type === 'constructors'
  const year = data.year

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">Rd</TableHead>
            <TableHead>Race</TableHead>
            <TableHead className="text-right" style={{ color: a.color }}>
              {a.short}
            </TableHead>
            <TableHead className="text-right" style={{ color: b.color }}>
              {b.short}
            </TableHead>
            <TableHead className="text-center">{perCar ? 'Best finish Δ' : 'Finish Δ'}</TableHead>
            <TableHead className="text-center">{perCar ? 'Best grid Δ' : 'Grid Δ'}</TableHead>
            <TableHead className="text-right">Pts</TableHead>
            <TableHead className="text-center">Gap after</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.rounds.map((r) => (
            <TableRow key={r.round}>
              <TableCell className="text-muted-foreground tabular-nums">{r.round}</TableCell>
              <TableCell className="max-w-[12rem] truncate">
                <Link
                  href={`/seasons/${year}/races/${r.round}`}
                  className="hover:text-primary transition-colors"
                >
                  {r.raceName.replace(/ Grand Prix$/, ' GP')}
                </Link>
              </TableCell>
              <TableCell className="text-right tabular-nums" title={carsTitle(r.a)}>
                <span className="font-semibold">{finishText(r.a, perCar)}</span>
                <span className="text-muted-foreground ml-1 text-xs">
                  from {gridText(r.a, perCar)}
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums" title={carsTitle(r.b)}>
                <span className="font-semibold">{finishText(r.b, perCar)}</span>
                <span className="text-muted-foreground ml-1 text-xs">
                  from {gridText(r.b, perCar)}
                </span>
              </TableCell>
              <TableCell className="text-center">
                <DeltaChip delta={r.finishDelta} better="lower" sides={sides} />
              </TableCell>
              <TableCell className="text-center">
                <DeltaChip delta={r.gridDelta} better="lower" sides={sides} />
              </TableCell>
              <TableCell className="text-right text-xs whitespace-nowrap tabular-nums">
                <span style={{ color: a.color }}>{formatPoints(r.a.points)}</span>
                <span className="text-muted-foreground"> / </span>
                <span style={{ color: b.color }}>{formatPoints(r.b.points)}</span>
              </TableCell>
              <TableCell className="text-center">
                <DeltaChip delta={r.cumulativeDelta} better="higher" sides={sides} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
