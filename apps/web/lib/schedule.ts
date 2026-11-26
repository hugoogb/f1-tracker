import type { Race, RaceSchedule } from '@/lib/types'

export interface Session {
  key: keyof RaceSchedule
  label: string
  at: string
  isRace: boolean
}

const SESSION_ORDER: { key: keyof RaceSchedule; label: string }[] = [
  { key: 'fp1', label: 'Practice 1' },
  { key: 'fp2', label: 'Practice 2' },
  { key: 'sprintQualifying', label: 'Sprint Qualifying' },
  { key: 'fp3', label: 'Practice 3' },
  { key: 'sprintRace', label: 'Sprint' },
  { key: 'qualifying', label: 'Qualifying' },
  { key: 'race', label: 'Race' },
]

export function sessionsOf(schedule: RaceSchedule | undefined): Session[] {
  if (!schedule) return []
  return SESSION_ORDER.filter(({ key }) => schedule[key])
    .map(({ key, label }) => ({ key, label, at: schedule[key]!, isRace: key === 'race' }))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
}

export function raceStart(race: Pick<Race, 'date' | 'schedule'>): string {
  return race.schedule?.race ?? race.date
}

export function nextSession(sessions: Session[], now: number = Date.now()): Session | null {
  return sessions.find((session) => Date.parse(session.at) > now) ?? null
}
