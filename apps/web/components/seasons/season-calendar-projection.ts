import type { LatLng } from '@/lib/geo'

export type Point = [x: number, y: number]

export const WORLD_PX = 256

const MAX_LATITUDE = 85.0511287798

export function mercator([lat, lng]: LatLng): Point {
  const clamped = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, lat))
  const sin = Math.sin((clamped * Math.PI) / 180)
  const x = WORLD_PX * (0.5 + lng / 360)
  const y = WORLD_PX * (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI))
  return [x, y]
}

export function unmercator([x, y]: Point): LatLng {
  const lng = (x / WORLD_PX - 0.5) * 360
  const n = Math.PI * (1 - (2 * y) / WORLD_PX)
  const lat = (Math.atan(Math.sinh(n)) * 180) / Math.PI
  return [lat, lng]
}

export function cumulativeLength(points: Point[]): number[] {
  const out = [0]
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1]
    const [x1, y1] = points[i]
    out.push(out[i - 1] + Math.hypot(x1 - x0, y1 - y0))
  }
  return out
}

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

export function pointAt(path: ProjectedPath, fraction: number): Point {
  if (path.points.length === 1) return path.points[0]
  return locate(path, fraction).point
}

export function prefixAt(path: ProjectedPath, fraction: number): Point[] {
  if (path.points.length < 2 || fraction <= 0) return path.points.slice(0, 1)
  if (fraction >= 1) return path.points
  const { index, point } = locate(path, fraction)
  return [...path.points.slice(0, index + 1), point]
}

export function headingAt(path: ProjectedPath, fraction: number): number | null {
  const total = path.lengths[path.lengths.length - 1]
  if (!(total > 0)) return null
  const step = Math.min(0.5, 2 / total)
  const [ax, ay] = pointAt(path, fraction - step)
  const [bx, by] = pointAt(path, fraction + step)
  if (ax === bx && ay === by) return null
  return Math.atan2(bx - ax, ay - by)
}

export function nearestCopy(lng: number, centerLng: number): number {
  return lng + 360 * Math.round((centerLng - lng) / 360)
}

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

export function followZoom(s: number, stopZoom: number, legZoom: number): number {
  const out = Math.max(0, stopZoom - legZoom)
  return stopZoom - out * Math.sin(Math.PI * Math.max(0, Math.min(1, s)))
}

export function smoothstep(t: number): number {
  const x = Math.max(0, Math.min(1, t))
  return x * x * (3 - 2 * x)
}
