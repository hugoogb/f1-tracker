import type { CSSProperties } from 'react'

/**
 * Puts a page (or one panel) in a team's livery.
 *
 * Everything that draws in the page accent — panel brackets, meters, the hero
 * stripe — reads `var(--accent-livery)`, which defaults to F1 red. Setting it
 * inline on a subtree recolours that subtree. Without a colour nothing is set,
 * so the accent stays red rather than resolving to an empty value.
 */
export function liveryStyle(color: string | null | undefined): CSSProperties {
  if (!color) return {}
  return { '--livery': color, '--accent-livery': color } as CSSProperties
}

/**
 * A driver page's livery: the colour of their most recent team. Deliberately
 * not an older team's colour when the latest one has none — the page falls
 * back to red rather than wearing a team the driver had already left.
 */
export function latestTeamColor(
  seasons: readonly { year: number; constructor: { color: string | null } | null }[],
): string | null {
  if (seasons.length === 0) return null
  const latest = seasons.reduce((a, b) => (b.year > a.year ? b : a))
  return latest.constructor?.color ?? null
}
