import type { Race, RaceSchedule } from '@/lib/types'

export interface Session {
  key: keyof RaceSchedule
  label: string
  /** UTC instant. */
  at: string
  /** The session everything else on the weekend builds towards. */
  isRace: boolean
}

/** Weekend running order. Sprint weekends drop FP2/FP3 and f1db leaves them null. */
const SESSION_ORDER: { key: keyof RaceSchedule; label: string }[] = [
  { key: 'fp1', label: 'Practice 1' },
  { key: 'fp2', label: 'Practice 2' },
  { key: 'sprintQualifying', label: 'Sprint Qualifying' },
  { key: 'fp3', label: 'Practice 3' },
  { key: 'sprintRace', label: 'Sprint' },
  { key: 'qualifying', label: 'Qualifying' },
  { key: 'race', label: 'Race' },
]

/**
 * The weekend's sessions in chronological order.
 *
 * Sorted by start time rather than trusted to the canonical order: the two
 * differ on sprint weekends, and a schedule change would otherwise render out
 * of sequence.
 */
export function sessionsOf(schedule: RaceSchedule | undefined): Session[] {
  if (!schedule) return []
  return SESSION_ORDER.filter(({ key }) => schedule[key])
    .map(({ key, label }) => ({ key, label, at: schedule[key]!, isRace: key === 'race' }))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
}

/** True when f1db carries session times for this race at all. */
export function hasSchedule(schedule: RaceSchedule | undefined): boolean {
  return sessionsOf(schedule).length > 0
}

/**
 * When the race itself starts, as a UTC instant.
 *
 * Falls back to the calendar date for the seasons f1db does not schedule.
 * Note that the fallback is midnight UTC, so it is a day marker, not a start
 * time — callers that count down should check `schedule.race` first.
 */
export function raceStart(race: Pick<Race, 'date' | 'schedule'>): string {
  return race.schedule?.race ?? race.date
}

/**
 * The next session of the weekend that has not started yet.
 *
 * A session already under way is not "next": once its start time passes it is
 * either running or done, and either way the countdown belongs to the one
 * after it.
 */
export function nextSession(sessions: Session[], now: number = Date.now()): Session | null {
  return sessions.find((session) => Date.parse(session.at) > now) ?? null
}
