'use client'

import { useHydrated } from '@/lib/client-only'

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

  return hydrated
    ? new Intl.DateTimeFormat(undefined, resolved).format(date)
    : new Intl.DateTimeFormat('en-GB', { ...resolved, timeZone: 'UTC' }).format(date)
}

interface LocalDateProps {
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

export function LocalDateTime({ value, style = 'medium', className }: LocalDateProps) {
  const text = useFormatted(value, DATE_OPTIONS[style], true)
  if (text === null) return null
  return (
    <time dateTime={value} className={className} suppressHydrationWarning>
      {text}
    </time>
  )
}

export function LocalWeekdayTime({ value, className }: { value: string; className?: string }) {
  const text = useFormatted(value, { weekday: 'short' }, true)
  if (text === null) return null
  return (
    <time dateTime={value} className={className} suppressHydrationWarning>
      {text}
    </time>
  )
}
