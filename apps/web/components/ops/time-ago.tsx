'use client'

import { useNow } from '@/lib/client-only'

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 60 * 60 * 1000],
  ['month', 30 * 24 * 60 * 60 * 1000],
  ['day', 24 * 60 * 60 * 1000],
  ['hour', 60 * 60 * 1000],
  ['minute', 60 * 1000],
  ['second', 1000],
]

export function TimeAgo({ value, className }: { value: string; className?: string }) {
  const now = useNow()
  const then = new Date(value).getTime()

  if (now === null || Number.isNaN(then)) return null

  const elapsed = then - now
  const [unit, ms] = UNITS.find(([, size]) => Math.abs(elapsed) >= size) ?? UNITS[UNITS.length - 1]

  const text = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(
    Math.round(elapsed / ms),
    unit,
  )

  return (
    <span className={className} suppressHydrationWarning>
      {text}
    </span>
  )
}
