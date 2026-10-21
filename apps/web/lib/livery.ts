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
