import { greatCircleKm, greatCirclePath, type LatLng } from '@/lib/geo'
import { raceStart } from '@/lib/schedule'
import type { CalendarRound } from '@/lib/types'

/**
 * The data model behind the season calendar map — kept free of Leaflet so the
 * shell, the canvas and anything else can share it without pulling the map in.
 */

/**
 * Where a round sits relative to the viewer's "now".
 *
 * `previous`/`next` only exist while a season is in progress. `unknown` is the
 * state before the client clock is available, so nothing claims a race is next
 * on a render the server could have produced.
 */
export type StopStatus = 'completed' | 'previous' | 'next' | 'future' | 'unknown'

export interface CalendarStop {
  /** Position in `stops` (not the round number — rounds without coordinates are skipped). */
  index: number
  round: CalendarRound
  latLng: LatLng
  status: StopStatus
}

/** The travel leg arriving at a stop. `legs[0]` is null: round one is where it starts. */
export interface CalendarLeg {
  path: LatLng[]
  km: number
}

export type CalendarCamera = { nonce: number; animate: boolean } & (
  | { kind: 'overview' }
  | { kind: 'stop'; index: number; zoom?: number; ms?: number }
  | { kind: 'leg'; to: number; ms: number }
)

/**
 * A continuous position along the calendar: `3` is parked at the fourth stop,
 * `3.4` is 40% of the way to the fifth.
 *
 * A tiny external store rather than React state, because it moves every frame
 * during playback and only a few small pieces (the glyph, the km counter, the
 * timeline fill) need to follow it that closely.
 */
export class Playhead {
  private value: number
  private listeners = new Set<() => void>()

  constructor(value: number) {
    this.value = value
  }

  get = (): number => this.value

  set = (value: number): void => {
    if (value === this.value) return
    this.value = value
    for (const listener of this.listeners) listener()
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
}

/** Rounds that can go on the map, with the great-circle legs between them. */
export function buildRoute(rounds: CalendarRound[]): {
  points: { round: CalendarRound; latLng: LatLng }[]
  legs: (CalendarLeg | null)[]
  cumulativeKm: number[]
} {
  const points = rounds
    .filter((r) => r.circuit.latitude !== null && r.circuit.longitude !== null)
    .map((round) => ({
      round,
      latLng: [round.circuit.latitude!, round.circuit.longitude!] as LatLng,
    }))

  const legs: (CalendarLeg | null)[] = points.map((point, i) =>
    i === 0
      ? null
      : {
          path: greatCirclePath(points[i - 1].latLng, point.latLng),
          km: greatCircleKm(points[i - 1].latLng, point.latLng),
        },
  )

  const cumulativeKm: number[] = []
  legs.forEach((leg, i) => cumulativeKm.push((cumulativeKm[i - 1] ?? 0) + (leg?.km ?? 0)))

  return { points, legs, cumulativeKm }
}

export interface SeasonProgress {
  statuses: StopStatus[]
  /** Index of the next race not yet run, or -1 (season over, or clock unknown). */
  next: number
  /** Index of the last race run while the season is in progress, or -1. */
  previous: number
  /** True once every round has been run. */
  finished: boolean
}

/**
 * Splits the calendar on the viewer's clock, the same way the home page does:
 * a race is done once its start time has passed (the calendar date — midnight
 * UTC — where f1db has no schedule). A recorded winner also settles it, so a
 * historic season never depends on the clock at all.
 */
export function seasonProgress(rounds: CalendarRound[], now: number | null): SeasonProgress {
  const done = rounds.map((round) => {
    if (round.winner) return true
    if (now === null) return null
    const start = Date.parse(raceStart({ date: round.date ?? '', schedule: round.schedule }))
    return Number.isFinite(start) ? start <= now : false
  })

  if (done.every((d) => d === true)) {
    return { statuses: rounds.map(() => 'completed'), next: -1, previous: -1, finished: true }
  }
  if (now === null) {
    return {
      statuses: done.map((d) => (d ? 'completed' : 'unknown')),
      next: -1,
      previous: -1,
      finished: false,
    }
  }

  const next = done.findIndex((d) => !d)
  const previous = next - 1
  const statuses = rounds.map((_, i): StopStatus => {
    if (i === next) return 'next'
    if (i === previous) return 'previous'
    return done[i] ? 'completed' : 'future'
  })
  return { statuses, next, previous, finished: false }
}

/** Ease in and out, so the glyph pulls away from a circuit and settles into the next. */
export function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

/** How long a leg takes at 1×: longer hauls fly longer, within limits that keep the pace up. */
export function travelMs(km: number): number {
  return Math.min(3600, Math.max(1400, 1000 + km * 0.17))
}
