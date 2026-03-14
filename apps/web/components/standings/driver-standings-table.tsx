import Link from 'next/link'
import { TEAM_COLORS } from '@/lib/constants'
import type { DriverStanding } from '@/lib/types'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface DriverStandingsTableProps {
  standings: DriverStanding[]
  limit?: number
}

export function DriverStandingsTable({ standings, limit }: DriverStandingsTableProps) {
  const rows = limit ? standings.slice(0, limit) : standings

  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">No driver standings available.</p>
  }

  return (
    <Table aria-label="Driver standings">
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">Pos</TableHead>
          <TableHead>Driver</TableHead>
          <TableHead className="text-right">Points</TableHead>
          <TableHead className="text-right">Wins</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((entry) => {
          const teamColor = entry.constructor ? (TEAM_COLORS[entry.constructor.ref] ?? null) : null

          return (
            <TableRow key={entry.driver.ref}>
              <TableCell className="font-medium">{entry.position}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  {teamColor && (
                    <span
                      className="inline-block h-3 w-1 rounded-full"
                      style={{ backgroundColor: teamColor }}
                    />
                  )}
                  <Link
                    href={`/drivers/${entry.driver.ref}`}
                    className="hover:text-primary transition-colors"
                  >
                    {entry.driver.firstName} {entry.driver.lastName}
                  </Link>
                </div>
              </TableCell>
              <TableCell className="text-right">{entry.points}</TableCell>
              <TableCell className="text-right">{entry.wins}</TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
