import Link from 'next/link'
import { Suspense } from 'react'
import { api } from '@/lib/api'
import type { Driver, PaginatedResponse } from '@/lib/types'
import { CountryFlag } from '@/components/ui/country-flag'
import { DriverAvatar } from '@/components/ui/driver-avatar'
import { Badge } from '@/components/ui/badge'
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
import { FadeIn } from '@/components/ui/motion'

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
      <PageHeader
        title="Drivers"
        description={`${total} drivers${nationality ? ` from ${nationality}` : ' across F1 history'}`}
      />

      <Suspense>
        <ListFilter label="Nationality" paramName="nationality" options={nationalities} />
      </Suspense>

      <FadeIn>
        <Table aria-label="Drivers">
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="hidden sm:table-cell">Code</TableHead>
              <TableHead>Nationality</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {drivers.map((driver) => (
              <TableRow key={driver.id}>
                <TableCell>
                  <Link
                    href={`/drivers/${driver.ref}`}
                    className="hover:text-primary inline-flex items-center gap-2.5 font-medium transition-colors"
                  >
                    <DriverAvatar
                      firstName={driver.firstName}
                      lastName={driver.lastName}
                      headshotUrl={driver.headshotUrl}
                    />
                    {driver.firstName} {driver.lastName}
                  </Link>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  {driver.code && (
                    <Badge variant="secondary" className="font-mono">
                      {driver.code}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    {driver.nationality && <CountryFlag code={driver.countryCode} />}
                    {driver.nationality ?? '—'}
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
