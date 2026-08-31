'use client'

import { ReferenceArea } from 'recharts'
import type { RaceControlPeriod, RaceControlPeriodKind } from '@/lib/types'

/** Neutral, low-saturation bands: they sit behind the data, never compete with it. */
const PERIOD_STYLES: Record<RaceControlPeriodKind, { label: string; fill: string }> = {
  SAFETY_CAR: { label: 'Safety car', fill: '#FFC906' },
  VIRTUAL_SAFETY_CAR: { label: 'Virtual safety car', fill: '#FFE083' },
  RED_FLAG: { label: 'Red flag', fill: '#FF3333' },
}

/**
 * Shaded lap spans for safety car, VSC and red flag periods.
 *
 * Returned as an array rather than a component because Recharts only picks up
 * `ReferenceArea` when it is a direct child of the chart element.
 */
export function safetyCarAreas(periods: RaceControlPeriod[] | undefined) {
  if (!periods?.length) return null

  return periods.map((period) => {
    const style = PERIOD_STYLES[period.kind]
    if (!style) return null
    return (
      <ReferenceArea
        key={`${period.kind}-${period.startLap}`}
        x1={period.startLap}
        x2={period.endLap}
        fill={style.fill}
        fillOpacity={0.12}
        stroke={style.fill}
        strokeOpacity={0.35}
        strokeDasharray="3 3"
        ifOverflow="hidden"
      />
    )
  })
}

/** Legend for the shaded periods, so the bands are never colour-alone. */
export function RaceControlLegend({ periods }: { periods: RaceControlPeriod[] | undefined }) {
  if (!periods?.length) return null

  const kinds = [...new Set(periods.map((p) => p.kind))]

  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-xs">
      {kinds.map((kind) => {
        const style = PERIOD_STYLES[kind]
        const count = periods.filter((p) => p.kind === kind).length
        return (
          <span key={kind} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-3 w-4 rounded-sm border"
              style={{ backgroundColor: `${style.fill}20`, borderColor: `${style.fill}55` }}
              aria-hidden
            />
            {style.label}
            {count > 1 && ` ×${count}`}
          </span>
        )
      })}
    </div>
  )
}
