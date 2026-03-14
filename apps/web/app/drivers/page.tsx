import Link from 'next/link'
import { Suspense } from 'react'
import { api } from '@/lib/api'
import type { Driver, PaginatedResponse } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Pagination } from '@/components/pagination'
import { ListFilter } from '@/components/list-filter'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Drivers | F1 Tracker',
  description: 'Browse all Formula 1 drivers throughout history',
}

export default async function DriversPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; nationality?: string }>
}) {
  const params = await searchParams
  const page = Number(params.page) || 1
  const pageSize = 50
  const nationality = params.nationality || undefined

  const [driversResponse, nationalitiesResult] = await Promise.allSettled([
    api.drivers.list(page, pageSize, nationality) as Promise<PaginatedResponse<Driver>>,
    api.drivers.nationalities(),
  ])

  const { data: drivers, total } =
    driversResponse.status === 'fulfilled'
      ? driversResponse.value
      : { data: [] as Driver[], total: 0 }

  const nationalities =
    nationalitiesResult.status === 'fulfilled' ? nationalitiesResult.value.nationalities : []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Drivers</h1>
        <p className="text-muted-foreground">
          {total} drivers{nationality ? ` from ${nationality}` : ' across F1 history'}
        </p>
      </div>

      <Suspense>
        <ListFilter label="Nationality" paramName="nationality" options={nationalities} />
      </Suspense>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Code</TableHead>
            <TableHead>Nationality</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {drivers.map((driver) => (
            <TableRow key={driver.id}>
              <TableCell>
                <Link href={`/drivers/${driver.ref}`} className="font-medium hover:underline">
                  {driver.firstName} {driver.lastName}
                </Link>
              </TableCell>
              <TableCell>
                {driver.code && <Badge variant="secondary">{driver.code}</Badge>}
              </TableCell>
              <TableCell className="text-muted-foreground">{driver.nationality ?? '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Pagination total={total} page={page} pageSize={pageSize} />
    </div>
  )
}
