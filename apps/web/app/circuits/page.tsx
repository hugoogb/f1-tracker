import Link from 'next/link'
import { Suspense } from 'react'
import { api } from '@/lib/api'
import type { Circuit, PaginatedResponse } from '@/lib/types'
import { CountryFlag } from '@/components/ui/country-flag'
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
import { WorldMapWrapper } from '@/components/circuits/world-map-wrapper'
import { FadeIn } from '@/components/ui/motion'

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

  const [circuitsResponse, allCircuitsResponse, countriesResult] = await Promise.allSettled([
    api.circuits.list(page, pageSize, country) as Promise<PaginatedResponse<Circuit>>,
    api.circuits.list(1, 1000) as Promise<PaginatedResponse<Circuit>>,
    api.circuits.countries(),
  ])

  const { data: circuits, total } =
    circuitsResponse.status === 'fulfilled'
      ? circuitsResponse.value
      : { data: [] as Circuit[], total: 0 }

  const allCircuits =
    allCircuitsResponse.status === 'fulfilled' ? allCircuitsResponse.value.data : []

  const countries = countriesResult.status === 'fulfilled' ? countriesResult.value.countries : []

  // Filter circuits with valid coordinates for the map
  const mapCircuits = allCircuits
    .filter(
      (c): c is Circuit & { latitude: number; longitude: number } =>
        c.latitude != null && c.longitude != null,
    )
    .map((c) => ({
      ref: c.ref,
      name: c.name,
      country: c.country,
      latitude: c.latitude,
      longitude: c.longitude,
    }))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Circuits"
        description={`${total} circuits${country ? ` in ${country}` : ' across F1 history'}`}
      />

      {mapCircuits.length > 0 && <WorldMapWrapper circuits={mapCircuits} />}

      <Suspense>
        <ListFilter label="Country" paramName="country" options={countries} />
      </Suspense>

      <FadeIn>
        <Table aria-label="Circuits">
          <TableHeader>
            <TableRow>
              <TableHead>Circuit</TableHead>
              <TableHead className="hidden sm:table-cell">Location</TableHead>
              <TableHead>Country</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {circuits.map((circuit) => (
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
                  <span className="inline-flex items-center gap-1.5">
                    {circuit.country && <CountryFlag code={circuit.countryCode} />}
                    {circuit.country ?? '—'}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </FadeIn>

      <Suspense>
        <Pagination total={total} page={page} pageSize={pageSize} />
      </Suspense>
    </div>
  )
}
