import Link from 'next/link'
import { getTeamColor } from '@/lib/utils'
import type { QualifyingResult, FastestSectors, QualifyingSectorTimes } from '@/lib/types'
import { DriverAvatar } from '@/components/ui/driver-avatar'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface QualifyingTableProps {
  results: QualifyingResult[]
  fastestSectors?: FastestSectors | null
}

function formatSectorMs(ms: number | null): string {
  if (ms == null) return '-'
  return (ms / 1000).toFixed(3)
}

function SectorCell({
  sectorTimes,
  fastestSectors,
  driverRef,
}: {
  sectorTimes: QualifyingSectorTimes | undefined
  fastestSectors: FastestSectors | null | undefined
  driverRef: string
}) {
  if (!sectorTimes) return null

  const sectors = [
    { ms: sectorTimes.s1Ms, best: fastestSectors?.s1 },
    { ms: sectorTimes.s2Ms, best: fastestSectors?.s2 },
    { ms: sectorTimes.s3Ms, best: fastestSectors?.s3 },
  ]

  return (
    <div className="mt-0.5 flex gap-2">
      {sectors.map((s, i) => {
        const isBest =
          s.best && s.ms != null && s.best.driver.ref === driverRef && s.ms === s.best.timeMs
        return (
          <span
            key={i}
            className={`font-mono text-[10px] ${isBest ? 'font-medium text-purple-400' : 'text-muted-foreground/60'}`}
          >
            {formatSectorMs(s.ms)}
          </span>
        )
      })}
    </div>
  )
}

export function QualifyingTable({ results, fastestSectors }: QualifyingTableProps) {
  if (results.length === 0) {
    return <p className="text-muted-foreground text-sm">No qualifying results available.</p>
  }

  const hasSectors = results.some((r) => r.sectors != null)

  return (
    <div className="space-y-4">
      {fastestSectors && (
        <div className="glass flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg px-4 py-3">
          <span className="text-xs font-medium tracking-wider text-purple-400 uppercase">
            Fastest Sectors
          </span>
          {(['s1', 's2', 's3'] as const).map((key, i) => {
            const entry = fastestSectors[key]
            if (!entry) return null
            return (
              <div key={key} className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs font-medium">S{i + 1}</span>
                <span className="font-mono text-sm text-purple-300">
                  {formatSectorMs(entry.timeMs)}
                </span>
                <span className="text-muted-foreground text-xs">{entry.driver.lastName}</span>
              </div>
            )
          })}
        </div>
      )}

      <Table aria-label="Qualifying results">
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">Pos</TableHead>
            <TableHead>Driver</TableHead>
            <TableHead className="hidden md:table-cell">Constructor</TableHead>
            <TableHead>Q1</TableHead>
            <TableHead>Q2</TableHead>
            <TableHead>Q3</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {results.map((result, idx) => {
            const teamColor = getTeamColor(result.constructor.ref, result.constructor.color, null)

            return (
              <TableRow key={result.driver.ref ?? idx}>
                <TableCell className="font-medium">{result.position}</TableCell>
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
                        className="inline-block h-3 w-1 rounded-full"
                        style={{ backgroundColor: teamColor }}
                      />
                    )}
                    <Link
                      href={`/drivers/${result.driver.ref}`}
                      className="hover:text-primary transition-colors"
                    >
                      {result.driver.firstName} {result.driver.lastName}
                    </Link>
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <Link
                    href={`/constructors/${result.constructor.ref}`}
                    className="hover:text-primary transition-colors"
                  >
                    {result.constructor.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <div>
                    {result.q1 ?? '-'}
                    {hasSectors && (
                      <SectorCell
                        sectorTimes={result.sectors?.q1}
                        fastestSectors={fastestSectors}
                        driverRef={result.driver.ref}
                      />
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <div>
                    {result.q2 ?? '-'}
                    {hasSectors && (
                      <SectorCell
                        sectorTimes={result.sectors?.q2}
                        fastestSectors={fastestSectors}
                        driverRef={result.driver.ref}
                      />
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <div>
                    {result.q3 ?? '-'}
                    {hasSectors && (
                      <SectorCell
                        sectorTimes={result.sectors?.q3}
                        fastestSectors={fastestSectors}
                        driverRef={result.driver.ref}
                      />
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
