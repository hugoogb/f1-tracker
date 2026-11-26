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

export const lineCursor = { stroke: 'var(--hairline-strong)', strokeWidth: 1 } as const

export const barCursor = { fill: 'var(--surface-2)' } as const

export const REFERENCE = 'var(--hairline-strong)'

export const NEUTRAL = 'var(--label)'

export const SERIES = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
] as const

export function sideColor(side: 'a' | 'b'): string {
  return side === 'a' ? 'var(--side-a)' : 'var(--side-b)'
}

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

export const BAND = 'var(--grid-line)'

export function positionHeat(position: number): string {
  if (position <= 10) {
    const t = (position - 4) / 6
    return `oklch(${0.55 - t * 0.1} ${0.12 - t * 0.02} ${145 - t * 50})`
  }
  const t = Math.min((position - 11) / 10, 1)
  return `oklch(${0.4 - t * 0.1} 0.02 250)`
}

export const SCORE_COLORS: Record<string, string> = {
  closeness: '#3987e5',
  lateness: '#d95926',
  contention: '#199e70',
  variety: '#c98500',
  leadChanges: '#d55181',
}
