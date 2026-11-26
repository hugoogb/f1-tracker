import type { CSSProperties } from 'react'

export function liveryStyle(color: string | null | undefined): CSSProperties {
  if (!color) return {}
  return { '--livery': color, '--accent-livery': color } as CSSProperties
}

export function latestTeamColor(
  seasons: readonly { year: number; constructor: { color: string | null } | null }[],
): string | null {
  if (seasons.length === 0) return null
  const latest = seasons.reduce((a, b) => (b.year > a.year ? b : a))
  return latest.constructor?.color ?? null
}
