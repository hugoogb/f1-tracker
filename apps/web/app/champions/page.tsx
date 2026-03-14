import Link from 'next/link'
import { api } from '@/lib/api'
import type { SeasonChampion } from '@/lib/types'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Champions | F1 Tracker',
  description: 'Formula 1 World Champions throughout history',
}

export default async function ChampionsPage() {
  const { data: champions } = (await api.champions()) as {
    data: SeasonChampion[]
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Champions</h1>
        <p className="text-muted-foreground">F1 World Champions from every season</p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">Year</TableHead>
            <TableHead>Driver Champion</TableHead>
            <TableHead className="text-right">Points</TableHead>
            <TableHead>Constructor Champion</TableHead>
            <TableHead className="text-right">Points</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {champions.map((champion) => (
            <TableRow key={champion.year}>
              <TableCell className="font-medium">
                <Link href={`/seasons/${champion.year}`} className="hover:underline">
                  {champion.year}
                </Link>
              </TableCell>
              <TableCell>
                <Link href={`/drivers/${champion.driver.ref}`} className="hover:underline">
                  {champion.driver.firstName} {champion.driver.lastName}
                </Link>
              </TableCell>
              <TableCell className="text-right tabular-nums">{champion.driverPoints}</TableCell>
              <TableCell>
                {champion.constructor ? (
                  <Link
                    href={`/constructors/${champion.constructor.ref}`}
                    className="inline-flex items-center gap-2 hover:underline"
                  >
                    {champion.constructor.color && (
                      <span
                        className="inline-block size-3 rounded-full"
                        style={{
                          backgroundColor: champion.constructor.color,
                        }}
                      />
                    )}
                    {champion.constructor.name}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {champion.constructorPoints ?? '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
