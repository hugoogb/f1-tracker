/**
 * The one chart theme. Every Recharts chart spreads these instead of styling
 * its own axes, grid, cursor and tooltip. Values are CSS variables, so the
 * charts follow the tokens in `app/globals.css`; team and driver series keep
 * the colours their payloads carry.
 */

const DATA_FONT = 'var(--font-chakra), ui-monospace, monospace'

export const axisProps = {
  tick: { fill: 'var(--label)', fontSize: 11, fontFamily: DATA_FONT },
  axisLine: { stroke: 'var(--hairline)' },
  tickLine: false,
} as const

export const gridProps = {
  stroke: 'var(--hairline)',
  strokeDasharray: '3 4',
  vertical: false,
} as const

/** Cursor for line and area charts. */
export const lineCursor = { stroke: 'var(--hairline-strong)', strokeWidth: 1 } as const

/** Cursor for bar charts. */
export const barCursor = { fill: 'var(--surface-2)' } as const

/** Legend text, matching the axis labels. */
export const legendStyle = {
  fontSize: 11,
  fontFamily: DATA_FONT,
  color: 'var(--label)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
} as const

/** Reference lines (zero lines, medians, thresholds). */
export const REFERENCE = 'var(--hairline-strong)'

/** Text and strokes that are data but carry no team colour. */
export const NEUTRAL = 'var(--label)'

/** Series colours when no team colour applies, in order. */
export const SERIES = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
] as const

export const POSITIVE = 'var(--positive)'
export const NEGATIVE = 'var(--negative)'
export const FASTEST = 'var(--fastest)'

/** The fallback colour of a comparison side that has no team colour. */
export function sideColor(side: 'a' | 'b'): string {
  return side === 'a' ? 'var(--side-a)' : 'var(--side-b)'
}

/** Chrome for Recharts' built-in tooltip, where a chart keeps it. */
export const tooltipContentStyle = {
  backgroundColor: 'var(--surface-1)',
  border: '1px solid var(--hairline-strong)',
  borderRadius: 0,
  color: 'var(--foreground)',
  fontFamily: DATA_FONT,
  fontSize: 12,
  padding: '8px 12px',
} as const

export const tooltipLabelStyle = {
  color: 'var(--label)',
  fontSize: 11,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
} as const

/** Alternating background bands (eras, stints). */
export const BAND = 'var(--grid-line)'

/**
 * Heatmap fill for a finishing position below the podium: green through the
 * points, fading to grey after P10. The podium uses the gold/silver/bronze
 * tokens and is handled by the caller.
 */
export function positionHeat(position: number): string {
  if (position <= 10) {
    const t = (position - 4) / 6
    return `oklch(${0.55 - t * 0.1} ${0.12 - t * 0.02} ${145 - t * 50})`
  }
  const t = Math.min((position - 11) / 10, 1)
  return `oklch(${0.4 - t * 0.1} 0.02 250)`
}
