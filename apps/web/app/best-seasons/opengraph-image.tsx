import { ImageResponse } from 'next/og'
import { api } from '@/lib/api'
import { SITE_NAME } from '@/lib/seo'
import { teamColorOf } from '@/lib/utils'
import { OgCard, OgFallbackCard } from '@/components/seo/og-card'

export const alt = `The greatest Formula 1 seasons, ranked — ${SITE_NAME}`
// Literals, not imports: Next reads these by static analysis at build time.
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/** The top-ranked season as the card. Never throws: an outage gets the branded fallback. */
export default async function Image() {
  const fallback = () =>
    new ImageResponse(
      <OgFallbackCard eyebrow="Best seasons" title="The greatest title fights" />,
      size,
    )

  let best
  try {
    best = (await api.bestSeasons.list()).seasons[0]
  } catch {
    return fallback()
  }
  if (!best?.champion) return fallback()

  const champion = `${best.champion.driver.firstName} ${best.champion.driver.lastName}`
  const rival = best.runnerUp
    ? `${best.runnerUp.driver.firstName} ${best.runnerUp.driver.lastName}`
    : null

  return new ImageResponse(
    <OgCard
      eyebrow="Best seasons"
      title={`${best.year}: the greatest title fight`}
      subtitle={rival ? `${champion} beat ${rival}` : champion}
      meta={best.champion.constructor?.name ?? null}
      accent={teamColorOf(best.champion.constructor?.color, null)}
      stats={[
        { label: 'Score', value: best.score.total.toFixed(1) },
        { label: 'Margin', value: `${best.titleMargin ?? '—'} pts` },
        { label: 'Winners', value: best.distinctWinners },
        { label: 'Lead changes', value: best.leadChanges },
      ]}
    />,
    size,
  )
}
