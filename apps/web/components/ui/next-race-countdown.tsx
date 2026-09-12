'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { CalendarClock, MapPin } from 'lucide-react'
import { CountryFlag } from '@/components/ui/country-flag'
import { LocalDateTime, LocalWeekdayTime } from '@/components/ui/local-date'
import { cn } from '@/lib/utils'
import { useNow } from '@/lib/client-only'
import { nextSession, sessionsOf } from '@/lib/schedule'
import type { Race } from '@/lib/types'

interface NextRaceCountdownProps {
  race: Race
  seasonYear: number
}

function getTimeLeft(target: number, now: number) {
  const diff = target - now
  if (diff <= 0) return null

  return {
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor((diff % 86_400_000) / 3_600_000),
    minutes: Math.floor((diff % 3_600_000) / 60_000),
    seconds: Math.floor((diff % 60_000) / 1000),
  }
}

export function NextRaceCountdown({ race, seasonYear }: NextRaceCountdownProps) {
  const sessions = useMemo(() => sessionsOf(race.schedule), [race.schedule])

  // Null until the client takes over. The server has no clock the viewer would
  // recognise, and a countdown baked into HTML is stale before it arrives, so
  // the first client render has to match the server's and then correct itself.
  const now = useNow()

  // Counts down to the next session that has not started — qualifying on the
  // Saturday, not the race three days later. Without a schedule the only marker
  // is the race date, which is midnight UTC: a day, not a start time.
  const upcoming = now === null ? (sessions[0] ?? null) : nextSession(sessions, now)
  const target = upcoming ? Date.parse(upcoming.at) : Date.parse(race.date)
  const timeLeft = now === null ? null : getTimeLeft(target, now)

  const href = `/seasons/${seasonYear}/races/${race.round}`

  return (
    <div className="glass hover:border-primary/30 rounded-xl border transition-colors">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-widest uppercase">
            <CalendarClock className="h-3.5 w-3.5" />
            Next Up — Round {race.round}
          </p>
          <Link
            href={href}
            className="hover:text-primary block text-lg font-bold transition-colors"
          >
            {race.name}
          </Link>
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="inline-flex items-center gap-1.5">
              <CountryFlag code={race.circuit.countryCode} />
              {race.circuit.country}
            </span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {race.circuit.name}
            </span>
          </div>
        </div>

        <div className="space-y-2 sm:text-right">
          <p className="text-muted-foreground text-xs tracking-wider uppercase">
            {upcoming ? upcoming.label : 'Race day'}
            {upcoming && (
              <>
                {' · '}
                <LocalDateTime value={upcoming.at} style="short" />
              </>
            )}
          </p>
          <div className="flex gap-3 sm:justify-end">
            {[
              { value: timeLeft?.days, label: 'days' },
              { value: timeLeft?.hours, label: 'hrs' },
              { value: timeLeft?.minutes, label: 'min' },
              { value: timeLeft?.seconds, label: 'sec' },
            ].map(({ value, label }) => (
              <div key={label} className="text-center">
                <span
                  className="font-heading text-foreground block text-2xl font-bold tabular-nums sm:text-3xl"
                  suppressHydrationWarning
                >
                  {value === undefined ? '--' : String(value).padStart(2, '0')}
                </span>
                <span className="text-muted-foreground text-[10px] tracking-wider uppercase">
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {sessions.length > 0 && (
        <ul className="flex flex-wrap gap-x-5 gap-y-2 border-t border-[var(--glass-border)] px-5 py-3">
          {sessions.map((session) => {
            const done = now !== null && Date.parse(session.at) <= now
            const isNext = upcoming?.key === session.key
            return (
              <li
                key={session.key}
                suppressHydrationWarning
                className={cn(
                  'flex items-baseline gap-1.5 text-xs',
                  done && 'text-muted-foreground/50 line-through',
                  isNext && 'text-primary font-semibold',
                  !done && !isNext && 'text-muted-foreground',
                )}
              >
                <span className={cn(session.isRace && !done && 'text-foreground font-medium')}>
                  {session.label}
                </span>
                <LocalWeekdayTime value={session.at} className="tabular-nums" />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
