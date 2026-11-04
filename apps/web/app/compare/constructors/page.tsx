import { redirect } from 'next/navigation'
import { api } from '@/lib/api'
import {
  ConstructorComparison,
  type ConstructorCompareResponse as CompareConstructorsResponse,
} from '@/components/compare/constructor-comparison'
import { buildMetadata } from '@/lib/seo'

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ c1?: string; c2?: string }>
}) {
  const params = await searchParams

  // Every pairing is its own URL, so the results are kept out of the index and
  // `/compare` is the canonical entry point for them.
  const seo = (title: string, description: string) =>
    buildMetadata({ title, description, path: '/compare', noindex: true })

  const generic = () =>
    seo(
      'Compare Constructors',
      'Compare any two Formula 1 constructors head-to-head — race entries, wins, podiums, points and season-by-season form.',
    )

  if (!params.c1 || !params.c2) return generic()

  try {
    const data = (await api.compare.constructors(
      params.c1,
      params.c2,
    )) as CompareConstructorsResponse
    return seo(
      `${data.constructor1.name} vs ${data.constructor2.name}`,
      `${data.constructor1.name} against ${data.constructor2.name}: head-to-head race record, wins, podiums and points across every season they shared.`,
    )
  } catch {
    return generic()
  }
}

export default async function CompareConstructorsPage({
  searchParams,
}: {
  searchParams: Promise<{ c1?: string; c2?: string }>
}) {
  const params = await searchParams
  if (!params.c1 || !params.c2) redirect('/compare')

  let data: CompareConstructorsResponse
  try {
    data = (await api.compare.constructors(params.c1, params.c2)) as CompareConstructorsResponse
  } catch {
    redirect('/compare')
  }

  return <ConstructorComparison data={data} />
}
