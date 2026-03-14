import Link from 'next/link'
import type { ConstructorSeasonSummary } from '@/lib/types'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface SeasonHistoryTableProps {
  seasons: ConstructorSeasonSummary[]
}

export function ConstructorSeasonHistoryTable({ seasons }: SeasonHistoryTableProps) {
  if (seasons.length === 0) {
    return <p className="text-muted-foreground text-sm">Season data not yet available.</p>
  }

  return (
    <Table aria-label="Season history">
      <TableHeader>
        <TableRow>
          <TableHead>Year</TableHead>
          <TableHead className="text-right">Races</TableHead>
          <TableHead className="text-right">Wins</TableHead>
          <TableHead className="text-right">Podiums</TableHead>
          <TableHead className="text-right">Points</TableHead>
          <TableHead className="text-right">Pos</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {seasons.map((season) => (
          <TableRow key={season.year}>
            <TableCell>
              <Link
                href={`/seasons/${season.year}`}
                className="hover:text-primary transition-colors"
              >
                {season.year}
              </Link>
            </TableCell>
            <TableCell className="text-right">{season.races}</TableCell>
            <TableCell className="text-right">{season.wins}</TableCell>
            <TableCell className="text-right">{season.podiums}</TableCell>
            <TableCell className="text-right">{season.points}</TableCell>
            <TableCell className="text-right">{season.championshipPosition ?? '—'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
