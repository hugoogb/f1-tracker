import Link from 'next/link'
import { getTeamColor } from '@/lib/utils'
import type { DriverStanding } from '@/lib/types'
import { DriverAvatar } from '@/components/ui/driver-avatar'
import { PositionBadge } from '@/components/ui/position-badge'
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
          <TableHead className="hidden text-right sm:table-cell">Wins</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((entry) => {
          const teamColor = entry.constructor
            ? getTeamColor(entry.constructor.ref, null, null)
            : null

          return (
            <TableRow key={entry.driver.ref}>
              <TableCell>
                <PositionBadge position={entry.position} size="sm" />
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <DriverAvatar
                    firstName={entry.driver.firstName}
                    lastName={entry.driver.lastName}
                    headshotUrl={entry.driver.headshotUrl}
                    teamColor={teamColor ?? undefined}
                  />
                  {teamColor && (
                    <span
                      className="inline-block h-4 w-1 rounded-full"
                      style={{ backgroundColor: teamColor }}
                    />
                  )}
                  <Link
                    href={`/drivers/${entry.driver.ref}`}
                    className="hover:text-primary font-medium transition-colors"
                  >
                    {entry.driver.firstName} {entry.driver.lastName}
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
