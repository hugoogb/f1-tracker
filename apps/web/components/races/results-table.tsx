import Link from 'next/link'
import { TEAM_COLORS } from '@/lib/constants'
import type { RaceResult } from '@/lib/types'
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
}

export function ResultsTable({ results }: ResultsTableProps) {
  if (results.length === 0) {
    return <p className="text-muted-foreground text-sm">No race results available.</p>
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">Pos</TableHead>
          <TableHead>Driver</TableHead>
          <TableHead>Constructor</TableHead>
          <TableHead className="text-right">Grid</TableHead>
          <TableHead className="text-right">Laps</TableHead>
          <TableHead>Time</TableHead>
          <TableHead className="text-right">Points</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {results.map((result, idx) => {
          const teamColor = TEAM_COLORS[result.constructor.ref] ?? result.constructor.color ?? null

          return (
            <TableRow key={result.driver.ref ?? idx}>
              <TableCell className="font-medium">{result.positionText}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  {teamColor && (
                    <span
                      className="inline-block h-3 w-1 rounded-full"
                      style={{ backgroundColor: teamColor }}
                    />
                  )}
                  <Link href={`/drivers/${result.driver.ref}`} className="hover:underline">
                    {result.driver.firstName} {result.driver.lastName}
                  </Link>
                </div>
              </TableCell>
              <TableCell>
                <Link href={`/constructors/${result.constructor.ref}`} className="hover:underline">
                  {result.constructor.name}
                </Link>
              </TableCell>
              <TableCell className="text-right">{result.grid}</TableCell>
              <TableCell className="text-right">{result.laps}</TableCell>
              <TableCell>
                <span className="text-muted-foreground">{result.time ?? result.status}</span>
              </TableCell>
              <TableCell className="text-right">{result.points}</TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
