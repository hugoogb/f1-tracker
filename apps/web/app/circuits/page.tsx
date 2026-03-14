import Link from 'next/link'
import { Suspense } from 'react'
import { api } from '@/lib/api'
import type { Circuit, PaginatedResponse } from '@/lib/types'
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
  title: 'Circuits | F1 Tracker',
  description: 'Browse all Formula 1 circuits throughout history',
}

export default async function CircuitsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; country?: string }>
}) {
  const params = await searchParams
  const page = Number(params.page) || 1
  const pageSize = 50
  const country = params.country || undefined

  const [circuitsResponse, countriesResult] = await Promise.allSettled([
    api.circuits.list(page, pageSize, country) as Promise<PaginatedResponse<Circuit>>,
    api.circuits.countries(),
  ])

  const { data: circuits, total } =
    circuitsResponse.status === 'fulfilled'
      ? circuitsResponse.value
      : { data: [] as Circuit[], total: 0 }

  const countries = countriesResult.status === 'fulfilled' ? countriesResult.value.countries : []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Circuits</h1>
        <p className="text-muted-foreground">
          {total} circuits{country ? ` in ${country}` : ' across F1 history'}
        </p>
      </div>

      <Suspense>
        <ListFilter label="Country" paramName="country" options={countries} />
      </Suspense>

      <Table aria-label="Circuits">
        <TableHeader>
          <TableRow>
            <TableHead>Circuit</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Country</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {circuits.map((circuit) => (
            <TableRow key={circuit.id}>
              <TableCell>
                <Link href={`/circuits/${circuit.ref}`} className="font-medium hover:underline">
                  {circuit.name}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground">{circuit.location ?? '—'}</TableCell>
              <TableCell className="text-muted-foreground">{circuit.country ?? '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Pagination total={total} page={page} pageSize={pageSize} />
    </div>
  )
}
