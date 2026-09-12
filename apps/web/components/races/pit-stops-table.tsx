import Link from 'next/link'
import { teamColorOf } from '@/lib/utils'
import type { PitStop } from '@/lib/types'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface PitStopsTableProps {
  pitStops: PitStop[]
  /** The race's quickest pit lane time, in seconds, that time lost is measured from. */
  benchmark?: string | null
}

export function PitStopsTable({ pitStops, benchmark }: PitStopsTableProps) {
  if (pitStops.length === 0) {
    return <p className="text-muted-foreground text-sm">No pit stop data available.</p>
  }

  return (
    <Table aria-label="Pit stops">
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">Stop</TableHead>
          <TableHead>Driver</TableHead>
          <TableHead className="hidden sm:table-cell">Team</TableHead>
          <TableHead className="text-right">Lap</TableHead>
          <TableHead className="text-right">Pit lane</TableHead>
          <TableHead className="text-right">
            {benchmark ? `vs ${benchmark}s` : 'Time lost'}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {pitStops.map((stop, idx) => {
          const color = stop.constructor ? teamColorOf(stop.constructor.color, null) : null
          const lost = stop.timeLost === null ? null : parseFloat(stop.timeLost)

          return (
            <TableRow key={`${stop.driver.ref}-${stop.stopNumber}-${idx}`}>
              <TableCell className="font-medium">{stop.stopNumber}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  {color && (
                    <span
                      className="inline-block h-4 w-1 shrink-0 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                  )}
                  <Link
                    href={`/drivers/${stop.driver.ref}`}
                    className="hover:text-primary transition-colors"
                  >
                    {stop.driver.firstName} {stop.driver.lastName}
                  </Link>
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground hidden sm:table-cell">
                {stop.constructor?.name ?? '—'}
              </TableCell>
              <TableCell className="text-right">{stop.lap}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {stop.duration ? `${stop.duration}s` : '—'}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {lost === null ? (
                  '—'
                ) : lost === 0 ? (
                  // The stop the rest of the race is measured against.
                  <span className="font-semibold text-green-400">best</span>
                ) : (
                  <span className={lost >= 2 ? 'text-amber-400' : 'text-muted-foreground'}>
                    +{lost.toFixed(3)}s
                  </span>
                )}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
