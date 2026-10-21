'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'
import { useHydrated } from '@/lib/client-only'
import type { CalendarRound } from '@/lib/types'
import type { SeasonCalendarVariant } from './season-calendar-map'

/**
 * Leaflet touches `window` at import time, so the map — and the playback shell
 * around it, which reads the clock, `sessionStorage` and the motion preference
 * on its first render — never enters the server bundle.
 */
const SeasonCalendarMap = dynamic(
  () => import('./season-calendar-map').then((mod) => mod.SeasonCalendarMap),
  { ssr: false, loading: () => <SeasonCalendarSkeleton /> },
)

/** Same footprint as the loaded map, so nothing below it jumps when it arrives. */
export function SeasonCalendarSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[68px]" />
        ))}
      </div>
      <div className="border-hairline relative h-[340px] w-full overflow-hidden border sm:h-[440px] lg:h-[520px]">
        <Skeleton className="h-full w-full rounded-none" />
        <div className="text-muted-foreground absolute inset-0 flex items-center justify-center text-xs tracking-widest uppercase">
          Loading map…
        </div>
      </div>
      <Skeleton className="h-[60px] md:h-[60px]" />
    </div>
  )
}

interface SeasonCalendarMapWrapperProps {
  year: number
  rounds: CalendarRound[]
  variant?: SeasonCalendarVariant
}

export function SeasonCalendarMapWrapper({
  year,
  rounds,
  variant = 'season',
}: SeasonCalendarMapWrapperProps) {
  // Mount only after hydration, so the map's first render is always a plain
  // client render — the clock is known and there is no server markup to match.
  const hydrated = useHydrated()
  const ref = useRef<HTMLDivElement>(null)
  const [nearViewport, setNearViewport] = useState(false)

  // Defer the Leaflet chunk and the world geometry until the section is about
  // to scroll into view; most visits to a season page never get that far.
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNearViewport(true)
          observer.disconnect()
        }
      },
      { rootMargin: '400px 0px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref}>
      {hydrated && nearViewport ? (
        <SeasonCalendarMap year={year} rounds={rounds} variant={variant} />
      ) : (
        <SeasonCalendarSkeleton />
      )}
    </div>
  )
}
