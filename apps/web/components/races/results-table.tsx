import Link from 'next/link'
import { ArrowUp, ArrowDown } from 'lucide-react'
import { TEAM_COLORS } from '@/lib/constants'
import type { RaceResult } from '@/lib/types'
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

interface ResultsTableProps {
  results: RaceResult[]
  fastestLapDriverRef?: string
}

export function ResultsTable({ results, fastestLapDriverRef }: ResultsTableProps) {
  if (results.length === 0) {
    return <p className="text-muted-foreground text-sm">No race results available.</p>
  }

  return (
    <Table aria-label="Race results">
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">Pos</TableHead>
          <TableHead>Driver</TableHead>
          <TableHead className="hidden md:table-cell">Constructor</TableHead>
          <TableHead className="hidden text-right sm:table-cell">Grid</TableHead>
          <TableHead className="hidden text-right md:table-cell">Laps</TableHead>
          <TableHead className="hidden sm:table-cell">Time</TableHead>
          <TableHead className="text-right">Pts</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {results.map((result, idx) => {
          const teamColor = TEAM_COLORS[result.constructor.ref] ?? result.constructor.color ?? null
          const isFinished = result.position != null
          const positionDelta = isFinished ? result.grid - (result.position ?? 0) : null
          const hasFastestLap = fastestLapDriverRef === result.driver.ref

          return (
            <TableRow key={result.driver.ref ?? idx} className={!isFinished ? 'opacity-50' : ''}>
              <TableCell>
                {isFinished ? (
                  <PositionBadge position={result.position!} size="sm" />
                ) : (
                  <span className="text-muted-foreground font-mono text-xs">
                    {result.positionText}
                  </span>
                )}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <DriverAvatar
                    firstName={result.driver.firstName}
                    lastName={result.driver.lastName}
                    headshotUrl={result.driver.headshotUrl}
                    teamColor={teamColor ?? undefined}
                  />
                  {teamColor && (
                    <span
                      className="inline-block h-4 w-1 rounded-full"
                      style={{ backgroundColor: teamColor }}
                    />
                  )}
                  <Link
                    href={`/drivers/${result.driver.ref}`}
                    className="hover:text-primary font-medium transition-colors"
                  >
                    {result.driver.firstName} {result.driver.lastName}
                  </Link>
                </div>
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <Link
                  href={`/constructors/${result.constructor.ref}`}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {result.constructor.name}
                </Link>
              </TableCell>
              <TableCell className="hidden text-right sm:table-cell">
                <div className="flex items-center justify-end gap-1">
                  {result.grid}
                  {positionDelta != null &&
                    positionDelta !== 0 &&
                    (positionDelta > 0 ? (
                      <ArrowUp className="text-positive h-3 w-3" />
                    ) : (
                      <ArrowDown className="text-negative h-3 w-3" />
                    ))}
                </div>
              </TableCell>
              <TableCell className="hidden text-right md:table-cell">{result.laps}</TableCell>
              <TableCell className="hidden sm:table-cell">
                <div className="space-y-0.5">
                  <span className="text-muted-foreground text-sm">
                    {result.time ?? result.status}
                  </span>
                  {hasFastestLap && result.fastestLapTime && (
                    <div className="flex items-center gap-1">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-purple-500" />
                      <span className="font-mono text-xs text-purple-400">
                        {result.fastestLapTime}
                      </span>
                    </div>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums">{result.points}</TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
