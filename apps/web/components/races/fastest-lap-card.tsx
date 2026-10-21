import Link from 'next/link'

import { Panel, PanelContent } from '@/components/ui/panel'
import { FadeIn } from '@/components/ui/motion'

interface LapHolder {
  driver: { ref: string; firstName: string; lastName: string }
  constructor?: { color: string | null } | null
  time: string | null
}

/**
 * A purple readout for one lap: a race's fastest lap, or a circuit's lap
 * record (`label="Lap record"` with the year in `detail`).
 */
export function FastestLapCard({
  fastestLap,
  label = 'Fastest lap',
  detail,
}: {
  fastestLap: LapHolder & { lapNumber?: number | null; speed?: string | null }
  label?: string
  detail?: string
}) {
  const meta =
    detail ??
    [
      fastestLap.lapNumber ? `Lap ${fastestLap.lapNumber}` : null,
      fastestLap.speed ? `${fastestLap.speed} km/h` : null,
    ]
      .filter(Boolean)
      .join(' · ')

  return (
    <FadeIn>
      <Panel size="sm" accent="var(--fastest)" className="bg-fastest/5">
        <PanelContent className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <p className="label text-fastest">{label}</p>
          <div className="flex items-center gap-2">
            {fastestLap.constructor?.color && (
              <span
                aria-hidden
                className="inline-block h-3.5 w-1"
                style={{ backgroundColor: fastestLap.constructor.color }}
              />
            )}
            <Link
              href={`/drivers/${fastestLap.driver.ref}`}
              className="hover:text-fastest focus-ring text-sm font-semibold transition-colors"
            >
              {fastestLap.driver.firstName} {fastestLap.driver.lastName}
            </Link>
          </div>
          <span className="display text-fastest text-2xl tabular-nums">{fastestLap.time}</span>
          {meta && <span className="font-data text-muted-foreground text-xs">{meta}</span>}
        </PanelContent>
      </Panel>
    </FadeIn>
  )
}
