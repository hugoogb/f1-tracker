/**
 * The statistics behind every violin chart: medians and quartiles, a Gaussian
 * kernel density for the outline, a deterministic horizontal spread for the
 * dots and round axis ticks.
 *
 * The race chart runs these in the browser on laps the page already has. The
 * season and profile charts get the same shapes pre-computed by the API, so
 * the Python helper behind them reproduces this file — Silverman bandwidth,
 * a grid padded by two bandwidths, widest point scaled to 1. Change both or
 * neither, as with `geo.ts` / `geo.py`.
 */

/** One point of a density outline; `w` is relative width, the widest point is 1. */
export interface DensityPoint {
  y: number
  w: number
}

/** One observation drawn as a dot; `x` is its spread across the violin, -1 to 1. */
export interface ViolinDot {
  y: number
  x: number
  color: string
  meta: Record<string, string>
}

export interface ViolinColumn {
  key: string
  label: string
  color: string
  median: number
  q1: number
  q3: number
  density: DensityPoint[]
  dots?: ViolinDot[]
}

const GRID_POINTS = 48

export function median(values: number[]): number {
  if (values.length === 0) throw new Error('median of an empty list')
  return quantile(
    [...values].sort((a, b) => a - b),
    0.5,
  )
}

/** Quantile of an ascending list, interpolating linearly between ranks (R's type 7). */
export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) throw new Error('quantile of an empty list')
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

/**
 * Silverman's rule of thumb. Never zero: a column whose values are all equal
 * still needs a width to draw, so it falls back to a sliver of its median.
 */
export function silvermanBandwidth(values: number[]): number {
  const n = values.length
  const sorted = [...values].sort((a, b) => a - b)
  const mean = values.reduce((sum, v) => sum + v, 0) / n
  const sd = n > 1 ? Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1)) : 0
  const iqr = quantile(sorted, 0.75) - quantile(sorted, 0.25)
  const spread = sd > 0 && iqr > 0 ? Math.min(sd, iqr / 1.34) : Math.max(sd, iqr / 1.34)
  const h = 0.9 * spread * n ** -0.2
  if (h > 0 && Number.isFinite(h)) return h
  return Math.max(Math.abs(quantile(sorted, 0.5)) * 0.001, 1e-6)
}

/** Gaussian KDE over `[min − 2h, max + 2h]`, scaled so the widest point is 1. */
export function kde(values: number[], points = GRID_POINTS): DensityPoint[] {
  const h = silvermanBandwidth(values)
  const lo = Math.min(...values) - 2 * h
  const hi = Math.max(...values) + 2 * h
  const step = (hi - lo) / (points - 1)
  const raw = Array.from({ length: points }, (_, i) => {
    const y = lo + i * step
    let w = 0
    for (const v of values) w += Math.exp(-0.5 * ((y - v) / h) ** 2)
    return { y, w }
  })
  const peak = Math.max(...raw.map((p) => p.w))
  return raw.map((p) => ({ y: p.y, w: p.w / peak }))
}

/** Relative width of an outline at `y`; 0 outside it. */
export function densityAt(density: DensityPoint[], y: number): number {
  if (density.length === 0 || y < density[0].y || y > density[density.length - 1].y) return 0
  for (let i = 1; i < density.length; i++) {
    const a = density[i - 1]
    const b = density[i]
    if (y <= b.y) {
      if (b.y === a.y) return b.w
      return a.w + ((b.w - a.w) * (y - a.y)) / (b.y - a.y)
    }
  }
  return density[density.length - 1].w
}

/**
 * The y range every drawable column spans. A column with no density (no data
 * for that slot) has nothing to draw and does not stretch the axis; null when
 * no column can be drawn at all.
 */
export function violinDomain(columns: ViolinColumn[]): { lo: number; hi: number } | null {
  const drawable = columns.filter((c) => c.density.length > 0)
  if (drawable.length === 0) return null
  return {
    lo: Math.min(...drawable.map((c) => c.density[0].y)),
    hi: Math.max(...drawable.map((c) => c.density[c.density.length - 1].y)),
  }
}

/**
 * The closed outline of one violin: up the right side, back down the left.
 * `half` is the pixel half-width at the widest point; empty for no density.
 */
export function outlinePath(
  density: DensityPoint[],
  centre: number,
  half: number,
  toPx: (y: number) => number,
): string {
  if (density.length === 0) return ''
  const right = density.map((p) => `${centre + p.w * half},${toPx(p.y)}`)
  const left = [...density].reverse().map((p) => `${centre - p.w * half},${toPx(p.y)}`)
  return `M${[...right, ...left].join('L')}Z`
}

/**
 * A stable pseudo-random spread in [-1, 1] (FNV-1a of the seed). Never
 * `Math.random`: the server and client renders must agree, and a cached page
 * whose dots moved on every render would be a new cache write each time.
 */
export function jitter(seed: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return ((hash >>> 0) / 0xffffffff) * 2 - 1
}

/** Round ticks inside `[min, max]`, at most `maxTicks` of them, on a 1/2/2.5/5 step. */
export function niceTicks(min: number, max: number, maxTicks: number): number[] {
  if (!(max > min) || maxTicks < 2) return []
  const tidy = (x: number) => Number(x.toFixed(10))
  const base = 10 ** Math.floor(Math.log10((max - min) / maxTicks))
  for (const magnitude of [base, base * 10, base * 100]) {
    for (const m of [1, 2, 2.5, 5]) {
      const step = m * magnitude
      const first = Math.ceil(tidy(min / step))
      const last = Math.floor(tidy(max / step))
      if (last - first + 1 <= maxTicks) {
        return Array.from({ length: last - first + 1 }, (_, i) => tidy((first + i) * step))
      }
    }
  }
  return [min, max]
}
