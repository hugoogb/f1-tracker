import type { ReactElement } from 'react'

/**
 * Shared layout for the generated OpenGraph cards.
 *
 * Rendered by Satori, which supports only a subset of CSS: flexbox only (no
 * grid), and every element with more than one child needs an explicit
 * `display: flex`. Styles are inline for the same reason — there is no
 * stylesheet in this rendering context.
 */

export const OG_SIZE = { width: 1200, height: 630 }
export const OG_CONTENT_TYPE = 'image/png'

const BACKGROUND = '#08080A'
const FOREGROUND = '#FAFAFA'
const MUTED = '#8A8A93'
const ACCENT = '#E10600'

export interface OgStat {
  label: string
  value: string | number
}

interface OgCardProps {
  /** Small line above the title: the kind of thing being shown. */
  eyebrow: string
  title: string
  subtitle?: string
  stats?: OgStat[]
  /** Team colour for the accent bar, when the subject has one. */
  accent?: string | null
}

export function OgCard({ eyebrow, title, subtitle, stats, accent }: OgCardProps): ReactElement {
  const accentColor = accent || ACCENT

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: BACKGROUND,
        padding: '64px 72px',
        fontFamily: 'sans-serif',
      }}
    >
      {/* Accent bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: 10,
          backgroundColor: accentColor,
          display: 'flex',
        }}
      />

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 8,
              height: 28,
              backgroundColor: accentColor,
              display: 'flex',
              borderRadius: 2,
            }}
          />
          <div
            style={{
              fontSize: 22,
              color: MUTED,
              letterSpacing: 4,
              textTransform: 'uppercase',
              display: 'flex',
            }}
          >
            {eyebrow}
          </div>
        </div>

        <div
          style={{
            fontSize: title.length > 28 ? 68 : 88,
            fontWeight: 700,
            color: FOREGROUND,
            marginTop: 28,
            lineHeight: 1.05,
            display: 'flex',
          }}
        >
          {title}
        </div>

        {subtitle && (
          <div style={{ fontSize: 32, color: MUTED, marginTop: 20, display: 'flex' }}>
            {subtitle}
          </div>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 40,
        }}
      >
        <div style={{ display: 'flex', gap: 56 }}>
          {(stats ?? []).map((stat) => (
            <div key={stat.label} style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 52, fontWeight: 700, color: FOREGROUND, display: 'flex' }}>
                {stat.value}
              </div>
              <div
                style={{
                  fontSize: 20,
                  color: MUTED,
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                  marginTop: 4,
                  display: 'flex',
                }}
              >
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: ACCENT, display: 'flex' }}>F1</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: FOREGROUND, display: 'flex' }}>
            TRACKER
          </div>
        </div>
      </div>
    </div>
  )
}

/** A minimal card for when the subject could not be loaded. */
export function OgFallback(): ReactElement {
  return <OgCard eyebrow="Formula 1" title="F1 Tracker" subtitle="Every season since 1950" />
}
