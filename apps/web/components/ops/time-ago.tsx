'use client'

import { useNow } from '@/lib/client-only'

/**
 * How long ago something happened, in the viewer's own locale.
 *
 * "Did Monday's ingest run?" is a question about the gap between a stored
 * timestamp and right now, and the server knows only half of that — it cannot
 * read the viewer's clock, and a cached page would freeze the answer at render
 * time anyway. So the gap is computed client-side, off the shared `useNow`
 * ticker, and renders nothing at all on the server pass. The absolute
 * timestamp next to it is what carries the information until then.
 */

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

  // Null on the server and for the first client render, which is what keeps
  // hydration quiet; `suppressHydrationWarning` covers the swap that follows.
  if (now === null || Number.isNaN(then)) return null

  const elapsed = then - now
  const [unit, ms] = UNITS.find(([, size]) => Math.abs(elapsed) >= size) ?? UNITS[UNITS.length - 1]

  // `undefined` as the locale means whatever the browser is set to — the whole
  // point of doing this in the browser.
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
