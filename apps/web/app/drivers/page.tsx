import Link from 'next/link'
import { Suspense } from 'react'
import { api } from '@/lib/api'
import type { Driver, PaginatedResponse } from '@/lib/types'
import { CountryFlag } from '@/components/ui/country-flag'
import { DriverAvatar } from '@/components/ui/driver-avatar'
import { Badge } from '@/components/ui/badge'
import { PageHero } from '@/components/ui/page-hero'
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
import { FavouriteButton } from '@/components/favourites/favourite-button'
import { buildListMetadata } from '@/lib/seo'
import { NATIONALITY_PAGES, nationalityHref } from '@/lib/seo-landing'

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; nationality?: string }>
}) {
  const { page, nationality } = await searchParams
  return buildListMetadata(
    {
      title: 'F1 Drivers: Every Formula 1 Driver Since 1950',
      description:
        'Every driver to have started a Formula 1 Grand Prix since 1950, filterable by nationality, with career stats, wins, poles and championships.',
      path: '/drivers',
    },
    { page, filter: nationality },
  )
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
      <PageHero
        eyebrow="Archive"
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
              <TableHead className="w-12 text-right">
                <span className="sr-only">Favourite</span>
              </TableHead>
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
                    <DriverAvatar firstName={driver.firstName} lastName={driver.lastName} />
                    {driver.firstName} {driver.lastName}
                  </Link>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  {driver.code && <Badge variant="secondary">{driver.code}</Badge>}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    {driver.nationality && <CountryFlag code={driver.countryCode} />}
                    {driver.nationality ?? '—'}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <FavouriteButton
                    type="driver"
                    entityRef={driver.ref}
                    name={`${driver.firstName} ${driver.lastName}`}
                    detail={driver.nationality}
                    countryCode={driver.countryCode}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </FadeIn>

      <Suspense>
        <Pagination total={total} page={page} pageSize={pageSize} />
      </Suspense>

      <nav aria-labelledby="by-nationality-heading" className="space-y-3">
        <h2 id="by-nationality-heading">F1 drivers by nationality</h2>
        <ul className="flex flex-wrap gap-2">
          {NATIONALITY_PAGES.map((n) => (
            <li key={n.slug}>
              <Link
                href={nationalityHref(n)}
                prefetch={false}
                className="border-hairline bg-surface-1 hover:bg-surface-2 focus-ring block border px-3 py-1.5 text-sm transition-colors"
              >
                {n.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
