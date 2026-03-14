import Link from 'next/link'
import { Crown } from 'lucide-react'
import { TEAM_COLORS } from '@/lib/constants'
import type { DriverSeasonSummary } from '@/lib/types'
import { PositionBadge } from '@/components/ui/position-badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface SeasonHistoryTableProps {
  seasons: DriverSeasonSummary[]
}

export function SeasonHistoryTable({ seasons }: SeasonHistoryTableProps) {
  if (seasons.length === 0) {
    return <p className="text-muted-foreground text-sm">Season data not yet available.</p>
  }

  return (
    <Table aria-label="Season history">
      <TableHeader>
        <TableRow>
          <TableHead>Year</TableHead>
          <TableHead>Team</TableHead>
          <TableHead className="hidden text-right sm:table-cell">Races</TableHead>
          <TableHead className="text-right">Wins</TableHead>
          <TableHead className="hidden text-right sm:table-cell">Podiums</TableHead>
          <TableHead className="text-right">Points</TableHead>
          <TableHead className="text-right">Pos</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {seasons.map((season) => {
          const teamColor = season.constructor
            ? (TEAM_COLORS[season.constructor.ref] ?? season.constructor.color ?? null)
            : null
          const isChampion = season.championshipPosition === 1

          return (
            <TableRow key={`${season.year}-${season.constructor?.ref ?? ''}`}>
              <TableCell>
                <Link
                  href={`/seasons/${season.year}`}
                  className="hover:text-primary transition-colors"
                >
                  {season.year}
                </Link>
              </TableCell>
              <TableCell>
                {season.constructor ? (
                  <div className="flex items-center gap-2">
                    {teamColor && (
                      <span
                        className="inline-block h-4 w-1 rounded-full"
                        style={{ backgroundColor: teamColor }}
                      />
                    )}
                    <Link
                      href={`/constructors/${season.constructor.ref}`}
                      className="hover:text-primary transition-colors"
                    >
                      {season.constructor.name}
                    </Link>
                  </div>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="hidden text-right sm:table-cell">{season.races}</TableCell>
              <TableCell className="text-right">{season.wins}</TableCell>
              <TableCell className="hidden text-right sm:table-cell">{season.podiums}</TableCell>
              <TableCell className="text-right tabular-nums">{season.points}</TableCell>
              <TableCell className="text-right">
                {season.championshipPosition != null ? (
                  <div className="flex items-center justify-end gap-1.5">
                    {isChampion && <Crown className="h-3.5 w-3.5 text-amber-500" />}
                    <PositionBadge position={season.championshipPosition} size="sm" />
                  </div>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
