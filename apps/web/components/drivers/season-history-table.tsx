import Link from 'next/link'
import { TEAM_COLORS } from '@/lib/constants'
import type { DriverSeasonSummary } from '@/lib/types'
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
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Year</TableHead>
          <TableHead>Team</TableHead>
          <TableHead className="text-right">Races</TableHead>
          <TableHead className="text-right">Wins</TableHead>
          <TableHead className="text-right">Podiums</TableHead>
          <TableHead className="text-right">Points</TableHead>
          <TableHead className="text-right">Pos</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {seasons.map((season) => {
          const teamColor = season.constructor
            ? (TEAM_COLORS[season.constructor.ref] ?? season.constructor.color ?? null)
            : null

          return (
            <TableRow key={`${season.year}-${season.constructor?.ref ?? ''}`}>
              <TableCell>
                <Link href={`/seasons/${season.year}`} className="hover:underline">
                  {season.year}
                </Link>
              </TableCell>
              <TableCell>
                {season.constructor ? (
                  <div className="flex items-center gap-2">
                    {teamColor && (
                      <span
                        className="inline-block h-3 w-1 rounded-full"
                        style={{ backgroundColor: teamColor }}
                      />
                    )}
                    <Link
                      href={`/constructors/${season.constructor.ref}`}
                      className="hover:underline"
                    >
                      {season.constructor.name}
                    </Link>
                  </div>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-right">{season.races}</TableCell>
              <TableCell className="text-right">{season.wins}</TableCell>
              <TableCell className="text-right">{season.podiums}</TableCell>
              <TableCell className="text-right">{season.points}</TableCell>
              <TableCell className="text-right">{season.championshipPosition ?? '—'}</TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
