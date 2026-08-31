import type { Race } from './types'

export interface TimeLeft {
  days: number
  hours: number
  minutes: number
  seconds: number
}

/**
 * The instant a race starts.
 *
 * Prefers the published UTC start time. Races with no known start time — most
 * of the pre-2005 archive — fall back to midnight UTC on race day, so the
 * countdown expires as the race day begins rather than implying a precision
 * the data does not have.
 *
 * Returns null if the race carries no usable date at all.
 */
export function raceStartDate(race: Pick<Race, 'date' | 'startTime'>): Date | null {
  const raw = race.startTime ?? (race.date ? `${race.date}T00:00:00Z` : null)
  if (!raw) return null

  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/** Time remaining until `target`, or null once it has passed. */
export function getTimeLeft(target: Date, now: Date = new Date()): TimeLeft | null {
  const diff = target.getTime() - now.getTime()
  if (diff <= 0) return null

  return {
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor((diff % 86_400_000) / 3_600_000),
    minutes: Math.floor((diff % 3_600_000) / 60_000),
    seconds: Math.floor((diff % 60_000) / 1000),
  }
}

/**
 * Render a UTC start instant in the viewer's own timezone.
 *
 * Browser-only: on the server the timezone is the host's, not the viewer's.
 */
export function formatLocalStart(startTime: string): string | null {
  const parsed = new Date(startTime)
  if (Number.isNaN(parsed.getTime())) return null

  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed)
}
