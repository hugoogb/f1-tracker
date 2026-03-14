import Link from 'next/link'
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
}

export function PitStopsTable({ pitStops }: PitStopsTableProps) {
  if (pitStops.length === 0) {
    return <p className="text-muted-foreground text-sm">No pit stop data available.</p>
  }

  return (
    <Table aria-label="Pit stops">
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">Stop</TableHead>
          <TableHead>Driver</TableHead>
          <TableHead className="text-right">Lap</TableHead>
          <TableHead className="text-right">Duration</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {pitStops.map((stop, idx) => (
          <TableRow key={`${stop.driver.ref}-${stop.stopNumber}-${idx}`}>
            <TableCell className="font-medium">{stop.stopNumber}</TableCell>
            <TableCell>
              <Link
                href={`/drivers/${stop.driver.ref}`}
                className="hover:text-primary transition-colors"
              >
                {stop.driver.firstName} {stop.driver.lastName}
              </Link>
            </TableCell>
            <TableCell className="text-right">{stop.lap}</TableCell>
            <TableCell className="text-muted-foreground text-right font-mono">
              {stop.duration ? `${stop.duration}s` : '—'}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
