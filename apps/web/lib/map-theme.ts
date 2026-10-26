/**
 * Map colours. Leaflet writes `pathOptions` into SVG attributes and some of
 * them through its own maths, so these are concrete values rather than CSS
 * variables — the one place outside `components/seo` that keeps literals.
 * They mirror the tokens in `app/globals.css`.
 */

/** F1 red (--primary). */
export const MAP_RED = '#e10600'
/** A brighter red for the line already flown. */
export const MAP_RED_HOT = '#ff3b2f'
/** Text and route ink. */
export const MAP_INK = '#ffffff'
/** A pin or winner with no team colour (--label). */
export const MAP_NEUTRAL = '#9ba1ab'
/** The graticule under the land: the blueprint grid, barely there. */
export const MAP_GRID = 'rgba(255, 255, 255, 0.05)'
/** The ocean behind the land (--surface-0). */
export const MAP_OCEAN = '#0b0c10'

export const MAP_LAND = {
  fillColor: '#16181d',
  fillOpacity: 1,
  color: '#2a2d35',
  weight: 0.6,
} as const
