import Link from 'next/link'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { TYRE_COLORS } from '@/lib/constants'
import type { DriverStints } from '@/lib/types'

interface StintPaceTableProps {
  drivers: DriverStints[]
}

function formatLapTime(ms: number | null): string {
  if (ms === null) return '—'
  const minutes = Math.floor(ms / 60_000)
  const seconds = (ms % 60_000) / 1000
  return minutes > 0 ? `${minutes}:${seconds.toFixed(3).padStart(6, '0')}` : seconds.toFixed(3)
}

function formatDegradation(msPerLap: number | null): string {
  if (msPerLap === null) return '—'
  return `${msPerLap >= 0 ? '+' : ''}${(msPerLap / 1000).toFixed(3)}`
}

function CompoundBadge({ compound }: { compound: string | null }) {
  if (!compound) return <span className="text-muted-foreground">—</span>
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block size-2.5 rounded-full"
        style={{ backgroundColor: TYRE_COLORS[compound] ?? TYRE_COLORS.UNKNOWN }}
      />
      <span className="text-xs font-medium">{compound}</span>
    </span>
  )
}

export function StintPaceTable({ drivers }: StintPaceTableProps) {
  if (drivers.length === 0) {
    return <p className="text-muted-foreground text-sm">No stint data available for this race.</p>
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <Table aria-label="Stint pace by driver">
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">Pos</TableHead>
              <TableHead>Driver</TableHead>
              <TableHead className="w-16 text-right">Stint</TableHead>
              <TableHead>Compound</TableHead>
              <TableHead className="text-right">Laps</TableHead>
              <TableHead className="text-right">Median</TableHead>
              <TableHead className="text-right">Best</TableHead>
              <TableHead className="text-right">Deg (s/lap)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {drivers.flatMap((entry) =>
              entry.stints.map((stint, idx) => (
                <TableRow key={`${entry.driver.ref}-${stint.stint}`}>
                  {/* Position and name only on a driver's first stint row. */}
                  <TableCell className="font-medium">
                    {idx === 0 ? (entry.position ?? '—') : ''}
                  </TableCell>
                  <TableCell>
                    {idx === 0 && (
                      <Link
                        href={`/drivers/${entry.driver.ref}`}
                        className="hover:text-primary transition-colors"
                      >
                        {entry.driver.firstName} {entry.driver.lastName}
                      </Link>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{stint.stint}</TableCell>
                  <TableCell>
                    <CompoundBadge compound={stint.compound} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span className="text-muted-foreground mr-1.5 text-xs">
                      {stint.startLap}–{stint.endLap}
                    </span>
                    {stint.laps}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatLapTime(stint.medianMs)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatLapTime(stint.bestMs)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatDegradation(stint.degradationMsPerLap)}
                  </TableCell>
                </TableRow>
              )),
            )}
          </TableBody>
        </Table>
      </div>
      <p className="text-muted-foreground text-xs">
        Pace figures use green-flag laps only — out-laps, in-laps and laps slower than 107% of the
        race median are excluded. Degradation is fitted on fuel-corrected times, and is left blank
        for stints too short to fit meaningfully.
      </p>
    </div>
  )
}
