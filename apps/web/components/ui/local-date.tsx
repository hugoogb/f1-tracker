'use client'

import { useHydrated } from '@/lib/client-only'

/**
 * Dates rendered in the viewer's own locale and timezone.
 *
 * The server knows neither, so it emits a stable UTC/en-GB string and the
 * browser re-formats after hydration. Both produce the same markup on the first
 * pass, which keeps hydration quiet; `suppressHydrationWarning` covers the swap
 * on the render straight after.
 */

type DateStyle = 'short' | 'medium' | 'long' | 'full'

const DATE_OPTIONS: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  short: { day: 'numeric', month: 'short' },
  medium: { day: 'numeric', month: 'short', year: 'numeric' },
  long: { day: 'numeric', month: 'long', year: 'numeric' },
  full: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
}

const TIME_OPTIONS: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' }

function useFormatted(iso: string, options: Intl.DateTimeFormatOptions, withTime: boolean) {
  const hydrated = useHydrated()
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null

  const resolved = { ...options, ...(withTime ? TIME_OPTIONS : {}) }

  // `undefined` as the locale means "whatever the browser is set to", and
  // omitting timeZone means the viewer's own — which is the whole point here.
  return hydrated
    ? new Intl.DateTimeFormat(undefined, resolved).format(date)
    : new Intl.DateTimeFormat('en-GB', { ...resolved, timeZone: 'UTC' }).format(date)
}

interface LocalDateProps {
  /** An ISO-8601 instant or date. A date-only value is read as UTC. */
  value: string
  style?: DateStyle
  className?: string
}

export function LocalDate({ value, style = 'medium', className }: LocalDateProps) {
  const text = useFormatted(value, DATE_OPTIONS[style], false)
  if (text === null) return null
  return (
    <time dateTime={value} className={className} suppressHydrationWarning>
      {text}
    </time>
  )
}

/** Date and clock time — only meaningful for a value that carries a time. */
export function LocalDateTime({ value, style = 'medium', className }: LocalDateProps) {
  const text = useFormatted(value, DATE_OPTIONS[style], true)
  if (text === null) return null
  return (
    <time dateTime={value} className={className} suppressHydrationWarning>
      {text}
    </time>
  )
}

/** Clock time alone, for rows that already say which day they are on. */
export function LocalTime({ value, className }: { value: string; className?: string }) {
  const text = useFormatted(value, {}, true)
  if (text === null) return null
  return (
    <time dateTime={value} className={className} suppressHydrationWarning>
      {text}
    </time>
  )
}

/**
 * Weekday and clock time, e.g. "Sat 16:00".
 *
 * Which day a session falls on depends on the viewer's timezone, so the weekday
 * travels with the time rather than being used to group rows — a grouping
 * computed on the server would have to regroup on hydration.
 */
export function LocalWeekdayTime({ value, className }: { value: string; className?: string }) {
  const text = useFormatted(value, { weekday: 'short' }, true)
  if (text === null) return null
  return (
    <time dateTime={value} className={className} suppressHydrationWarning>
      {text}
    </time>
  )
}
