'use client'

import { CalendarClock } from 'lucide-react'
import { formatLocalStart, getTimeLeft } from '@/lib/race-time'
import { useNowSeconds } from '@/lib/use-now'
import type { WeekendSession } from '@/lib/types'

interface WeekendScheduleProps {
  sessions: WeekendSession[]
}

function formatCountdown(target: Date, now: Date): string | null {
  const left = getTimeLeft(target, now)
  if (!left) return null
  if (left.days > 0) return `in ${left.days}d ${left.hours}h`
  if (left.hours > 0) return `in ${left.hours}h ${left.minutes}m`
  return `in ${left.minutes}m`
}

export function WeekendSchedule({ sessions }: WeekendScheduleProps) {
  // Null while server-rendering: what counts as "next" depends on the viewer's
  // clock, and the displayed times on their timezone.
  const nowSeconds = useNowSeconds()
  const now = nowSeconds === null ? null : new Date(nowSeconds * 1000)

  if (sessions.length === 0) return null

  const nextIndex =
    now === null
      ? -1
      : sessions.findIndex((s) => s.startTime && new Date(s.startTime).getTime() > now.getTime())

  return (
    <section className="glass rounded-xl p-5">
      <h2 className="text-muted-foreground mb-4 flex items-center gap-2 text-xs font-medium tracking-widest uppercase">
        <CalendarClock className="h-3.5 w-3.5" />
        Weekend Schedule
      </h2>

      <ol className="divide-border divide-y">
        {sessions.map((session, index) => {
          const target = session.startTime ? new Date(session.startTime) : null
          const isNext = index === nextIndex
          const isPast = now !== null && target !== null && target.getTime() <= now.getTime()

          return (
            <li
              key={session.kind}
              className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5 ${
                isPast ? 'opacity-55' : ''
              }`}
            >
              <span
                className={`w-32 shrink-0 text-sm ${isNext ? 'text-primary font-semibold' : 'font-medium'}`}
              >
                {session.label}
              </span>

              <span className="text-muted-foreground text-sm tabular-nums">
                {target && now !== null
                  ? formatLocalStart(session.startTime!)
                  : (session.date ?? 'To be confirmed')}
              </span>

              {isNext && target && now !== null && (
                <span className="text-primary ml-auto text-xs font-medium">
                  {formatCountdown(target, now) ?? 'Under way'}
                </span>
              )}
            </li>
          )
        })}
      </ol>

      <p className="text-muted-foreground mt-3 text-xs">Times shown in your local timezone.</p>
    </section>
  )
}
