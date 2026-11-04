import Link from 'next/link'
import { notFound } from 'next/navigation'
import { api } from '@/lib/api'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { PageHero } from '@/components/ui/page-hero'
import { PageSummary } from '@/components/ui/page-summary'
import { Panel, PanelContent } from '@/components/ui/panel'
import { PositionBadge } from '@/components/ui/position-badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatRecordValue, rankingSummary } from '@/lib/page-summary'
import { SITE_DESCRIPTION, buildMetadata } from '@/lib/seo'
import { RECORD_RANKINGS, findRanking, rankingHref, type RecordRanking } from '@/lib/seo-landing'

/** Nothing at build; the first request for a listed ranking renders and caches it. */
export function generateStaticParams() {
  return []
}

/** The API's ceiling for one page of the explorer. */
const TOP_N = 50

const load = (ranking: RecordRanking) =>
  api.records.ranking({
    entity: ranking.entity === 'drivers' ? 'driver' : 'constructor',
    category: ranking.category,
    limit: TOP_N,
  })

interface Props {
  params: Promise<{ entity: string; slug: string }>
}

export async function generateMetadata({ params }: Props) {
  const { entity, slug } = await params
  const ranking = findRanking(entity, slug)
  const path = `/records/${entity}/${slug}`
  try {
    if (!ranking) throw new Error('not a listed ranking')
    return buildMetadata({
      title: ranking.title,
      description: rankingSummary(ranking, await load(ranking)),
      path,
    })
  } catch {
    // Streaming ships a 404 body with a 200, so noindex is what keeps it out.
    return buildMetadata({
      title: 'Records',
      description: SITE_DESCRIPTION,
      path,
      noindex: true,
    })
  }
}

export default async function RecordRankingPage({ params }: Props) {
  const { entity, slug } = await params
  const ranking = findRanking(entity, slug)
  if (!ranking) notFound()

  const res = await load(ranking)
  const isDriver = ranking.entity === 'drivers'
  const related = RECORD_RANKINGS.filter(
    (other) => other.entity === ranking.entity && other.slug !== ranking.slug,
  )

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: 'Records', href: '/records' },
          { label: ranking.title },
        ]}
      />
      <PageHero eyebrow="All-time F1 records" title={ranking.title} />
      <PageSummary text={rankingSummary(ranking, res)} />

      <Panel>
        <PanelContent>
          <Table aria-label={ranking.title}>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>{isDriver ? 'Driver' : 'Team'}</TableHead>
                <TableHead className="text-right">{res.label}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {res.data.map((row) => {
                const href = row.driver
                  ? `/drivers/${row.driver.ref}`
                  : `/constructors/${row.constructor?.ref}`
                const name = row.driver
                  ? `${row.driver.firstName} ${row.driver.lastName}`
                  : row.constructor?.name
                return (
                  <TableRow key={href}>
                    <TableCell>
                      <PositionBadge position={row.rank} size="sm" />
                    </TableCell>
                    <TableCell>
                      <Link
                        href={href}
                        prefetch={false}
                        className="hover:text-primary font-medium transition-colors"
                      >
                        {name}
                      </Link>
                    </TableCell>
                    <TableCell className="font-data text-right tabular-nums">
                      {formatRecordValue(row.value, res.format)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          <p className="text-muted-foreground mt-3 text-xs">{res.note}</p>
        </PanelContent>
      </Panel>

      <nav aria-labelledby="related-rankings-heading" className="space-y-3">
        <h2 id="related-rankings-heading">More all-time rankings</h2>
        <ul className="flex flex-wrap gap-2">
          {related.map((other) => (
            <li key={other.slug}>
              <Link
                href={rankingHref(other)}
                prefetch={false}
                className="border-hairline bg-surface-1 hover:bg-surface-2 focus-ring block border px-3 py-1.5 text-sm transition-colors"
              >
                {other.title}
              </Link>
            </li>
          ))}
          <li>
            <Link
              href="/records"
              className="text-primary focus-ring block px-3 py-1.5 text-sm hover:underline"
            >
              All records and filters →
            </Link>
          </li>
        </ul>
      </nav>
    </div>
  )
}
