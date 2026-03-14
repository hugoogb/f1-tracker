import Link from 'next/link'
import { Suspense } from 'react'
import { api } from '@/lib/api'
import type { Constructor, PaginatedResponse } from '@/lib/types'
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
import { FadeIn } from '@/components/ui/motion'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Constructors | F1 Tracker',
  description: 'Browse all Formula 1 constructors throughout history',
}

export default async function ConstructorsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; nationality?: string }>
}) {
  const params = await searchParams
  const page = Number(params.page) || 1
  const pageSize = 50
  const nationality = params.nationality || undefined

  const [constructorsResponse, nationalitiesResult] = await Promise.allSettled([
    api.constructors.list(page, pageSize, nationality) as Promise<PaginatedResponse<Constructor>>,
    api.constructors.nationalities(),
  ])

  const { data: constructors, total } =
    constructorsResponse.status === 'fulfilled'
      ? constructorsResponse.value
      : { data: [] as Constructor[], total: 0 }

  const nationalities =
    nationalitiesResult.status === 'fulfilled' ? nationalitiesResult.value.nationalities : []

  return (
    <div className="space-y-6">
      <PageHeader
        title="Constructors"
        description={`${total} constructors${nationality ? ` from ${nationality}` : ' across F1 history'}`}
      />

      <Suspense>
        <ListFilter label="Nationality" paramName="nationality" options={nationalities} />
      </Suspense>

      <FadeIn>
        <Table aria-label="Constructors">
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Nationality</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {constructors.map((constructor) => (
              <TableRow key={constructor.id}>
                <TableCell>
                  <Link
                    href={`/constructors/${constructor.ref}`}
                    className="hover:text-primary inline-flex items-center gap-2.5 font-medium transition-colors"
                  >
                    {constructor.color && (
                      <span
                        className="inline-block h-4 w-1 rounded-full"
                        style={{ backgroundColor: constructor.color }}
                      />
                    )}
                    {constructor.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    {constructor.nationality && <CountryFlag code={constructor.countryCode} />}
                    {constructor.nationality ?? '—'}
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
