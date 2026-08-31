'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { Clock, MapPin } from 'lucide-react'
import { CountryFlag } from '@/components/ui/country-flag'
import { raceStartDate, getTimeLeft, formatLocalStart } from '@/lib/race-time'
import { useNowSeconds } from '@/lib/use-now'
import type { Race } from '@/lib/types'

interface NextRaceCountdownProps {
  race: Race
  seasonYear: number
}

export function NextRaceCountdown({ race, seasonYear }: NextRaceCountdownProps) {
  const target = useMemo(() => raceStartDate(race), [race])

  // Null while server-rendering: both the remaining time and the local-time
  // label depend on the viewer's clock and timezone.
  const nowSeconds = useNowSeconds()
  const timeLeft =
    target && nowSeconds !== null ? getTimeLeft(target, new Date(nowSeconds * 1000)) : null

  // Only hide the card once we know client-side that the race has started.
  if (nowSeconds !== null && !timeLeft) return null

  const localStart = nowSeconds !== null && race.startTime ? formatLocalStart(race.startTime) : null

  return (
    <Link
      href={`/seasons/${seasonYear}/races/${race.round}`}
      className="glass group hover:border-primary/30 block rounded-xl border p-5 transition-colors"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1.5">
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-widest uppercase">
            <Clock className="h-3.5 w-3.5" />
            Next Race — Round {race.round}
          </p>
          <h3 className="group-hover:text-primary text-lg font-bold transition-colors">
            {race.name}
          </h3>
          <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-sm">
            <span className="inline-flex items-center gap-1.5">
              <CountryFlag code={race.circuit.countryCode} />
              {race.circuit.country}
            </span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {race.circuit.name}
            </span>
          </div>
          {localStart && (
            <p className="text-muted-foreground/80 text-xs">Lights out {localStart} your time</p>
          )}
        </div>

        <div className="flex gap-3">
          {[
            { value: timeLeft?.days, label: 'days' },
            { value: timeLeft?.hours, label: 'hrs' },
            { value: timeLeft?.minutes, label: 'min' },
            { value: timeLeft?.seconds, label: 'sec' },
          ].map(({ value, label }) => (
            <div key={label} className="text-center">
              <span className="font-heading text-foreground block text-2xl font-bold tabular-nums sm:text-3xl">
                {value === undefined ? '--' : String(value).padStart(2, '0')}
              </span>
              <span className="text-muted-foreground text-[10px] tracking-wider uppercase">
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Link>
  )
}
