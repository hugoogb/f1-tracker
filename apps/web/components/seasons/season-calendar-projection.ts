import type { LatLng } from '@/lib/geo'

/**
 * Screen geometry for the season calendar map, in Web Mercator "world pixels"
 * at zoom 0 — the space Leaflet itself projects into. Kept free of Leaflet so
 * it can be tested, and so the canvas and the camera share one definition.
 *
 * Mercator is linear in zoom: a point at zoom z sits at its zoom-0 position
 * times 2^z. So everything (land, routes, the glyph) is projected once, and
 * every frame is a single scale and offset — never a re-projection.
 */

export type Point = [x: number, y: number]

/** Width of the world at zoom 0, in pixels (one 256px tile). */
export const WORLD_PX = 256

// Leaflet's SphericalMercator clamps here; matching it keeps the canvas on the markers.
const MAX_LATITUDE = 85.0511287798

/**
 * EPSG:3857 at zoom 0. Longitude is not wrapped, so a path unwrapped past
 * ±180° stays continuous on screen and simply runs onto the next world copy.
 */
export function mercator([lat, lng]: LatLng): Point {
  const clamped = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, lat))
  const sin = Math.sin((clamped * Math.PI) / 180)
  const x = WORLD_PX * (0.5 + lng / 360)
  const y = WORLD_PX * (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI))
  return [x, y]
}

/** Inverse of `mercator`. */
export function unmercator([x, y]: Point): LatLng {
  const lng = (x / WORLD_PX - 0.5) * 360
  const n = Math.PI * (1 - (2 * y) / WORLD_PX)
  const lat = (Math.atan(Math.sinh(n)) * 180) / Math.PI
  return [lat, lng]
}

/** Cumulative screen length along a polyline, starting at 0. */
export function cumulativeLength(points: Point[]): number[] {
  const out = [0]
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1]
    const [x1, y1] = points[i]
    out.push(out[i - 1] + Math.hypot(x1 - x0, y1 - y0))
  }
  return out
}

/** A projected leg: its vertices and their running length, for constant-speed travel. */
export interface ProjectedPath {
  points: Point[]
  lengths: number[]
}

export function projectPath(path: LatLng[]): ProjectedPath {
  const points = path.map(mercator)
  return { points, lengths: cumulativeLength(points) }
}

function locate({ points, lengths }: ProjectedPath, fraction: number) {
  const total = lengths[lengths.length - 1]
  const target = Math.max(0, Math.min(1, fraction)) * total
  // Binary search for the segment holding `target`.
  let lo = 0
  let hi = lengths.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (lengths[mid] <= target) lo = mid
    else hi = mid
  }
  const span = lengths[hi] - lengths[lo]
  const t = span > 0 ? (target - lengths[lo]) / span : 0
  const [x0, y0] = points[lo]
  const [x1, y1] = points[hi] ?? points[lo]
  return { index: lo, point: [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t] as Point }
}

/**
 * The point `fraction` of the way along a path, by on-screen length — so the
 * glyph moves at an even speed even where Mercator stretches the samples.
 */
export function pointAt(path: ProjectedPath, fraction: number): Point {
  if (path.points.length === 1) return path.points[0]
  return locate(path, fraction).point
}

/** The path up to `fraction`, ending exactly on `pointAt(path, fraction)`. */
export function prefixAt(path: ProjectedPath, fraction: number): Point[] {
  if (path.points.length < 2 || fraction <= 0) return path.points.slice(0, 1)
  if (fraction >= 1) return path.points
  const { index, point } = locate(path, fraction)
  return [...path.points.slice(0, index + 1), point]
}

/** Screen heading (radians, clockwise from north) of a path at `fraction`. */
export function headingAt(path: ProjectedPath, fraction: number): number | null {
  const total = path.lengths[path.lengths.length - 1]
  if (!(total > 0)) return null
  // A short chord either side of the point, so the arrow does not twitch
  // between vertices.
  const step = Math.min(0.5, 2 / total)
  const [ax, ay] = pointAt(path, fraction - step)
  const [bx, by] = pointAt(path, fraction + step)
  if (ax === bx && ay === by) return null
  return Math.atan2(bx - ax, ay - by)
}

/** The copy of `lng` (±360° steps) nearest to `centerLng`. */
export function nearestCopy(lng: number, centerLng: number): number {
  return lng + 360 * Math.round((centerLng - lng) / 360)
}

/**
 * Shifts longitudes by whole turns so they span the narrowest window: the
 * window starts just after the widest empty gap in the calendar. A season
 * that ends in the Americas and starts in Australia is framed across the
 * Pacific or across Europe, whichever leaves less empty map.
 */
export function compactLongitudes(lngs: number[]): number[] {
  if (lngs.length < 2) return lngs.slice()
  const wrapped = lngs.map((lng) => ((((lng + 180) % 360) + 360) % 360) - 180)
  const sorted = [...wrapped].sort((a, b) => a - b)
  let gap = sorted[0] + 360 - sorted[sorted.length - 1]
  let start = sorted[0]
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] > gap) {
      gap = sorted[i] - sorted[i - 1]
      start = sorted[i]
    }
  }
  return wrapped.map((lng) => (lng < start ? lng + 360 : lng))
}

/**
 * The zoom at which a box of `width` × `height` world pixels (zoom 0) fits
 * inside a `viewW` × `viewH` viewport with `padding` on every side.
 */
export function fitZoom(
  width: number,
  height: number,
  viewW: number,
  viewH: number,
  padding: number,
): number {
  const w = Math.max(viewW - 2 * padding, 1)
  const h = Math.max(viewH - 2 * padding, 1)
  const scale = Math.min(w / Math.max(width, 1e-6), h / Math.max(height, 1e-6))
  return Math.log2(scale)
}

/**
 * The chase camera's zoom along a leg: it pulls back from the departure to
 * frame the whole leg at the midpoint, and settles back in on arrival. Never
 * zooms *in* on a leg shorter than the arrival framing.
 */
export function followZoom(s: number, stopZoom: number, legZoom: number): number {
  const out = Math.max(0, stopZoom - legZoom)
  return stopZoom - out * Math.sin(Math.PI * Math.max(0, Math.min(1, s)))
}

/** 0 → 1 with zero slope at both ends. */
export function smoothstep(t: number): number {
  const x = Math.max(0, Math.min(1, t))
  return x * x * (3 - 2 * x)
}
