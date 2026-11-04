import { notFound } from 'next/navigation'
import { api } from '@/lib/api'
import {
  DriverComparison,
  driverCompareSummary,
  type DriverCompareResponse,
} from '@/components/compare/driver-comparison'
import { findPair, pairHref, type CuratedPair } from '@/lib/curated-comparisons'
import { SITE_DESCRIPTION, buildMetadata } from '@/lib/seo'

/** Nothing at build; the first request for a listed pair renders and caches it. */
export function generateStaticParams() {
  return []
}

const load = ({ a, b }: CuratedPair) =>
  api.compare.curatedDrivers(a, b) as Promise<DriverCompareResponse>

export async function generateMetadata({ params }: { params: Promise<{ pair: string }> }) {
  const { pair: slug } = await params
  const pair = findPair('drivers', slug)
  const path = pair ? pairHref('drivers', pair) : `/compare/drivers/${slug}`
  try {
    if (!pair) throw new Error('not a curated pair')
    return buildMetadata({
      title: `${pair.label}: F1 Head-to-Head Record & Stats`,
      description: driverCompareSummary(await load(pair)),
      path,
    })
  } catch {
    // Streaming ships a 404 body with a 200, so noindex is what keeps it out.
    return buildMetadata({
      title: 'Compare Drivers',
      description: SITE_DESCRIPTION,
      path,
      noindex: true,
    })
  }
}

export default async function CuratedDriverComparisonPage({
  params,
}: {
  params: Promise<{ pair: string }>
}) {
  const { pair: slug } = await params
  const pair = findPair('drivers', slug)
  if (!pair) notFound()
  return <DriverComparison data={await load(pair)} />
}
