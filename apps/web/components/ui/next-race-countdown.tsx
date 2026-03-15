'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Clock, MapPin } from 'lucide-react'
import { CountryFlag } from '@/components/ui/country-flag'
import type { Race } from '@/lib/types'

interface NextRaceCountdownProps {
  race: Race
  seasonYear: number
}

function getTimeLeft(targetDate: Date) {
  const now = new Date()
  const diff = targetDate.getTime() - now.getTime()

  if (diff <= 0) return null

  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((diff % (1000 * 60)) / 1000)

  return { days, hours, minutes, seconds }
}

export function NextRaceCountdown({ race, seasonYear }: NextRaceCountdownProps) {
  const raceDate = useMemo(() => new Date(race.date), [race.date])
  const [timeLeft, setTimeLeft] = useState(() => getTimeLeft(raceDate))

  useEffect(() => {
    const interval = setInterval(() => {
      const left = getTimeLeft(raceDate)
      setTimeLeft(left)
      if (!left) clearInterval(interval)
    }, 1000)

    return () => clearInterval(interval)
  }, [raceDate])

  if (!timeLeft) return null

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
          <div className="text-muted-foreground flex items-center gap-3 text-sm">
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

        <div className="flex gap-3">
          {[
            { value: timeLeft.days, label: 'days' },
            { value: timeLeft.hours, label: 'hrs' },
            { value: timeLeft.minutes, label: 'min' },
            { value: timeLeft.seconds, label: 'sec' },
          ].map(({ value, label }) => (
            <div key={label} className="text-center">
              <span className="font-heading text-foreground block text-2xl font-bold tabular-nums sm:text-3xl">
                {String(value).padStart(2, '0')}
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
