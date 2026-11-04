import { notFound } from 'next/navigation'
import { api } from '@/lib/api'
import {
  ConstructorComparison,
  constructorCompareSummary,
  type ConstructorCompareResponse,
} from '@/components/compare/constructor-comparison'
import { findPair, pairHref, type CuratedPair } from '@/lib/curated-comparisons'
import { SITE_DESCRIPTION, buildMetadata } from '@/lib/seo'

/** Nothing at build; the first request for a listed pair renders and caches it. */
export function generateStaticParams() {
  return []
}

const load = ({ a, b }: CuratedPair) =>
  api.compare.curatedConstructors(a, b) as Promise<ConstructorCompareResponse>

export async function generateMetadata({ params }: { params: Promise<{ pair: string }> }) {
  const { pair: slug } = await params
  const pair = findPair('constructors', slug)
  const path = pair ? pairHref('constructors', pair) : `/compare/constructors/${slug}`
  try {
    if (!pair) throw new Error('not a curated pair')
    return buildMetadata({
      title: `${pair.label}: F1 Head-to-Head Record`,
      description: constructorCompareSummary(await load(pair)),
      path,
    })
  } catch {
    // Streaming ships a 404 body with a 200, so noindex is what keeps it out.
    return buildMetadata({
      title: 'Compare Constructors',
      description: SITE_DESCRIPTION,
      path,
      noindex: true,
    })
  }
}

export default async function CuratedConstructorComparisonPage({
  params,
}: {
  params: Promise<{ pair: string }>
}) {
  const { pair: slug } = await params
  const pair = findPair('constructors', slug)
  if (!pair) notFound()
  return <ConstructorComparison data={await load(pair)} />
}
