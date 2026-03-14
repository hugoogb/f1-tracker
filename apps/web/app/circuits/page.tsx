import Link from 'next/link'
import { Suspense } from 'react'
import { api } from '@/lib/api'
import type { Circuit, PaginatedResponse } from '@/lib/types'
import { COUNTRY_FLAGS } from '@/lib/constants'
import { PageHeader } from '@/components/ui/page-header'
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
      <PageHeader
        title="Circuits"
        description={`${total} circuits${country ? ` in ${country}` : ' across F1 history'}`}
      />

      <Suspense>
        <ListFilter label="Country" paramName="country" options={countries} />
      </Suspense>

      <Table aria-label="Circuits">
        <TableHeader>
          <TableRow>
            <TableHead>Circuit</TableHead>
            <TableHead className="hidden sm:table-cell">Location</TableHead>
            <TableHead>Country</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {circuits.map((circuit) => {
            const flag = circuit.country ? COUNTRY_FLAGS[circuit.country] : null
            return (
              <TableRow key={circuit.id}>
                <TableCell>
                  <Link
                    href={`/circuits/${circuit.ref}`}
                    className="hover:text-primary font-medium transition-colors"
                  >
                    {circuit.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground hidden sm:table-cell">
                  {circuit.location ?? '—'}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {flag && <span className="mr-1.5">{flag}</span>}
                  {circuit.country ?? '—'}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      <Suspense>
        <Pagination total={total} page={page} pageSize={pageSize} />
      </Suspense>
    </div>
  )
}
