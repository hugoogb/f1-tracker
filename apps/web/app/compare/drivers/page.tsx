import { redirect } from 'next/navigation'
import { api } from '@/lib/api'
import {
  DriverComparison,
  type DriverCompareResponse as CompareResponse,
} from '@/components/compare/driver-comparison'
import { buildMetadata } from '@/lib/seo'

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ d1?: string; d2?: string }>
}) {
  const params = await searchParams

  // Every pairing of ~900 drivers is its own URL, so the results are kept out
  // of the index and `/compare` is the canonical entry point for them.
  const seo = (title: string, description: string) =>
    buildMetadata({ title, description, path: '/compare', noindex: true })

  const generic = () =>
    seo(
      'Compare Drivers',
      'Compare any two Formula 1 drivers head-to-head — wins, poles, podiums, championships, teammate seasons and points by season.',
    )

  if (!params.d1 || !params.d2) return generic()

  try {
    const data = (await api.compare.drivers(params.d1, params.d2)) as CompareResponse
    const one = `${data.driver1.firstName} ${data.driver1.lastName}`
    const two = `${data.driver2.firstName} ${data.driver2.lastName}`
    return seo(
      `${data.driver1.lastName} vs ${data.driver2.lastName}`,
      `${one} against ${two}: race and qualifying head-to-head, career wins, poles, podiums and championships, side by side.`,
    )
  } catch {
    return generic()
  }
}

export default async function CompareDriversPage({
  searchParams,
}: {
  searchParams: Promise<{ d1?: string; d2?: string; teammate?: string }>
}) {
  const params = await searchParams
  if (!params.d1 || !params.d2) redirect('/compare')

  const isTeammate = params.teammate === 'true'

  let data: CompareResponse
  try {
    data = (await api.compare.drivers(params.d1, params.d2, isTeammate)) as CompareResponse
  } catch {
    redirect('/compare')
  }

  return <DriverComparison data={data} isTeammate={isTeammate} />
}
