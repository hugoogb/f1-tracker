import Link from 'next/link'
import { TEAM_COLORS } from '@/lib/constants'
import type { QualifyingResult } from '@/lib/types'
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
}

export function QualifyingTable({ results }: QualifyingTableProps) {
  if (results.length === 0) {
    return <p className="text-muted-foreground text-sm">No qualifying results available.</p>
  }

  return (
    <Table aria-label="Qualifying results">
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">Pos</TableHead>
          <TableHead>Driver</TableHead>
          <TableHead>Constructor</TableHead>
          <TableHead>Q1</TableHead>
          <TableHead>Q2</TableHead>
          <TableHead>Q3</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {results.map((result, idx) => {
          const teamColor = TEAM_COLORS[result.constructor.ref] ?? result.constructor.color ?? null

          return (
            <TableRow key={result.driver.ref ?? idx}>
              <TableCell className="font-medium">{result.position}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
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
              <TableCell>
                <Link
                  href={`/constructors/${result.constructor.ref}`}
                  className="hover:text-primary transition-colors"
                >
                  {result.constructor.name}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground">{result.q1 ?? '-'}</TableCell>
              <TableCell className="text-muted-foreground">{result.q2 ?? '-'}</TableCell>
              <TableCell className="text-muted-foreground">{result.q3 ?? '-'}</TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
