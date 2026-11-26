import { greatCircleKm, greatCirclePath, type LatLng } from '@/lib/geo'
import { raceStart } from '@/lib/schedule'
import type { CalendarRound } from '@/lib/types'

export type StopStatus = 'completed' | 'previous' | 'next' | 'future' | 'unknown'

export interface CalendarStop {
  index: number
  round: CalendarRound
  latLng: LatLng
  status: StopStatus
}

export interface CalendarLeg {
  path: LatLng[]
  km: number
}

export type CalendarCamera = { nonce: number; animate: boolean } & (
  | { kind: 'overview' }
  | { kind: 'stop'; index: number; zoom?: number; ms?: number }
  | { kind: 'leg'; to: number; ms: number }
)

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
  next: number
  previous: number
  finished: boolean
}

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

export function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

export function travelMs(km: number): number {
  return Math.min(3600, Math.max(1400, 1000 + km * 0.17))
}
