import Link from 'next/link'
import { TEAM_COLORS } from '@/lib/constants'
import type { ConstructorStanding } from '@/lib/types'
import { PositionBadge } from '@/components/ui/position-badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface ConstructorStandingsTableProps {
  standings: ConstructorStanding[]
  limit?: number
}

export function ConstructorStandingsTable({ standings, limit }: ConstructorStandingsTableProps) {
  const rows = limit ? standings.slice(0, limit) : standings

  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">No constructor standings available.</p>
  }

  return (
    <Table aria-label="Constructor standings">
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">Pos</TableHead>
          <TableHead>Constructor</TableHead>
          <TableHead className="text-right">Points</TableHead>
          <TableHead className="hidden text-right sm:table-cell">Wins</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((entry) => {
          const teamColor = TEAM_COLORS[entry.constructor.ref] ?? entry.constructor.color

          return (
            <TableRow key={entry.constructor.ref}>
              <TableCell>
                <PositionBadge position={entry.position} size="sm" />
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  {teamColor && (
                    <span
                      className="inline-block h-3 w-3 rounded-full"
                      style={{ backgroundColor: teamColor }}
                    />
                  )}
                  <Link
                    href={`/constructors/${entry.constructor.ref}`}
                    className="hover:text-primary font-medium transition-colors"
                  >
                    {entry.constructor.name}
                  </Link>
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums">{entry.points}</TableCell>
              <TableCell className="hidden text-right sm:table-cell">{entry.wins}</TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
