import Link from 'next/link'
import { notFound } from 'next/navigation'
import { api } from '@/lib/api'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { PageHero } from '@/components/ui/page-hero'
import { PageSummary } from '@/components/ui/page-summary'
import { Panel, PanelContent, PanelHeader, PanelTitle } from '@/components/ui/panel'
import { PositionBadge } from '@/components/ui/position-badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { MAX_API_PAGE_SIZE, collectAllPages } from '@/lib/paged-fetch'
import { nationalitySummary } from '@/lib/page-summary'
import { SITE_DESCRIPTION, buildMetadata } from '@/lib/seo'
import {
  NATIONALITY_PAGES,
  findNationalityBySlug,
  nationalityHref,
  type NationalityPage,
} from '@/lib/seo-landing'
import type { Driver } from '@/lib/types'

/** Nothing at build; the first request for a listed page renders and caches it. */
export function generateStaticParams() {
  return []
}

/** The API's ceiling for one page of the explorer; more than any nationality's winners. */
const WINNERS_LIMIT = 50

async function load(page: NationalityPage) {
  const [drivers, winners] = await Promise.all([
    collectAllPages<Driver>((n) => api.drivers.list(n, MAX_API_PAGE_SIZE, page.nationality)),
    api.records.ranking({
      entity: 'driver',
      category: 'wins',
      nationality: page.nationality,
      limit: WINNERS_LIMIT,
    }),
  ])
  const [top] = winners.data
  const summary = nationalitySummary({
    label: page.label,
    total: drivers.length,
    winners: {
      total: winners.total,
      top: top?.driver
        ? { name: `${top.driver.firstName} ${top.driver.lastName}`, wins: top.value }
        : null,
    },
  })
  return { drivers, winners, summary }
}

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const page = findNationalityBySlug(slug)
  const path = `/drivers/nationality/${slug}`
  try {
    if (!page) throw new Error('not a listed nationality')
    return buildMetadata({
      title: `${page.label} F1 Drivers: Full List & Race Winners`,
      description: (await load(page)).summary,
      path,
    })
  } catch {
    // Streaming ships a 404 body with a 200, so noindex is what keeps it out.
    return buildMetadata({
      title: 'Drivers',
      description: SITE_DESCRIPTION,
      path,
      noindex: true,
    })
  }
}

export default async function NationalityPageRoute({ params }: Props) {
  const { slug } = await params
  const page = findNationalityBySlug(slug)
  if (!page) notFound()

  const { drivers, winners, summary } = await load(page)
  const others = NATIONALITY_PAGES.filter((n) => n.slug !== page.slug)

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: 'Drivers', href: '/drivers' },
          { label: `${page.label} drivers` },
        ]}
      />
      <PageHero eyebrow="Formula 1 drivers" title={`${page.label} F1 drivers`} />
      <PageSummary text={summary} />

      {winners.data.length > 0 && (
        <Panel>
          <PanelHeader>
            <PanelTitle>{page.label} race winners</PanelTitle>
          </PanelHeader>
          <PanelContent>
            <Table aria-label={`${page.label} race winners`}>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead className="text-right">Wins</TableHead>
                  <TableHead className="text-right">Starts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {winners.data.flatMap((row) =>
                  row.driver
                    ? [
                        <TableRow key={row.driver.ref}>
                          <TableCell>
                            <PositionBadge position={row.rank} size="sm" />
                          </TableCell>
                          <TableCell>
                            <Link
                              href={`/drivers/${row.driver.ref}`}
                              prefetch={false}
                              className="hover:text-primary font-medium transition-colors"
                            >
                              {row.driver.firstName} {row.driver.lastName}
                            </Link>
                          </TableCell>
                          <TableCell className="font-data text-right tabular-nums">
                            {row.value}
                          </TableCell>
                          <TableCell className="font-data text-right tabular-nums">
                            {row.starts}
                          </TableCell>
                        </TableRow>,
                      ]
                    : [],
                )}
              </TableBody>
            </Table>
          </PanelContent>
        </Panel>
      )}

      <Panel>
        <PanelHeader>
          <PanelTitle>Every {page.label} F1 driver</PanelTitle>
        </PanelHeader>
        <PanelContent>
          <ul className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {drivers.map((driver) => (
              <li key={driver.ref}>
                <Link
                  href={`/drivers/${driver.ref}`}
                  prefetch={false}
                  className="hover:text-primary transition-colors"
                >
                  {driver.firstName} {driver.lastName}
                </Link>
              </li>
            ))}
          </ul>
        </PanelContent>
      </Panel>

      <nav aria-labelledby="other-nationalities-heading" className="space-y-3">
        <h2 id="other-nationalities-heading">F1 drivers by nationality</h2>
        <ul className="flex flex-wrap gap-2">
          {others.map((n) => (
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
