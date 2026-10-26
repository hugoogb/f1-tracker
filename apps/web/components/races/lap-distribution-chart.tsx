'use client'

import { useMemo, useState } from 'react'

import { TooltipFrame, TooltipRow } from '@/components/charts/chart-tooltip'
import { ViolinChart } from '@/components/charts/violin-chart'
import { Button } from '@/components/ui/button'
import { ConstructorLogo } from '@/components/ui/constructor-logo'
import { CountryFlag } from '@/components/ui/country-flag'
import { DriverAvatar } from '@/components/ui/driver-avatar'
import { REFERENCE } from '@/lib/chart-theme'
import {
  axisLapLabel,
  CLEAN_LAP_THRESHOLD,
  formatLapTime,
  MIN_CLEAN_LAPS,
  raceDistribution,
  type DistributionMode,
  type RaceColumn,
} from '@/lib/lap-distribution'
import type { ChartDriverLaps } from '@/lib/types'

function formatGap(ms: number): string {
  return ms === 0 ? '0.000' : `+${(ms / 1000).toFixed(3)}`
}

const COMPOUND_ORDER = [
  'HYPERSOFT',
  'ULTRASOFT',
  'SUPERSOFT',
  'SOFT',
  'MEDIUM',
  'HARD',
  'INTERMEDIATE',
  'WET',
  'UNKNOWN',
]

/**
 * Every clean race lap as a dot coloured by tyre, a violin per driver (or per
 * team, teammates pooled) and a diamond at the median, fastest first. Lap 1
 * and anything over 107% of the race median are left out, as on the
 * degradation chart: one in-lap would otherwise stretch every violin.
 */
export function LapDistributionChart({ drivers }: { drivers: ChartDriverLaps[] }) {
  const [mode, setMode] = useState<DistributionMode>('drivers')
  const distribution = useMemo(() => raceDistribution(drivers, mode), [drivers, mode])
  // Swatches from the dots actually drawn, so a 2018 race's legend shows
  // that year's colours.
  const compounds = useMemo(() => {
    const drawn = new Map<string, string>()
    for (const column of distribution.columns) {
      for (const dot of column.dots ?? []) drawn.set(dot.meta.compound.toUpperCase(), dot.color)
    }
    return COMPOUND_ORDER.filter((c) => drawn.has(c)).map((c) => ({
      compound: c,
      color: drawn.get(c)!,
    }))
  }, [distribution])

  return (
    <div className="space-y-4">
      <div className="flex gap-1" role="group" aria-label="Distribution by">
        {(['drivers', 'constructors'] as const).map((value) => (
          <Button
            key={value}
            size="sm"
            variant={mode === value ? 'default' : 'outline'}
            aria-pressed={mode === value}
            onClick={() => setMode(value)}
          >
            {value === 'drivers' ? 'Drivers' : 'Constructors'}
          </Button>
        ))}
      </div>

      {distribution.columns.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Not enough clean laps to draw a distribution for this race.
        </p>
      ) : (
        <>
          <ViolinChart<RaceColumn>
            columns={distribution.columns}
            formatValue={axisLapLabel}
            ariaLabel={`Lap time distribution by ${mode === 'drivers' ? 'driver' : 'constructor'}`}
            renderFooter={(column) => (
              <>
                {column.entity.kind === 'driver' ? (
                  <>
                    <DriverAvatar
                      firstName={column.entity.firstName}
                      lastName={column.entity.lastName}
                      teamColor={column.color}
                    />
                    <CountryFlag code={column.entity.countryCode} size={10} />
                  </>
                ) : (
                  <ConstructorLogo name={column.entity.name} color={column.color} />
                )}
                <span className="label text-foreground max-w-full truncate">{column.label}</span>
                <span className="font-data text-muted-foreground text-2xs tabular-nums">
                  {formatGap(column.gapMs)}
                </span>
              </>
            )}
            renderTooltip={({ column, dot }) =>
              dot ? (
                <TooltipFrame title={dot.meta.driver}>
                  <TooltipRow name="Lap" value={dot.meta.lap} />
                  <TooltipRow name="Time" value={formatLapTime(dot.y, 3)} />
                  <TooltipRow color={dot.color} name="Tyre" value={dot.meta.compound} />
                </TooltipFrame>
              ) : (
                <TooltipFrame title={column.label}>
                  <TooltipRow name="Median" value={formatLapTime(column.median, 3)} />
                  <TooltipRow
                    name="IQR"
                    value={`${formatLapTime(column.q1, 3)} – ${formatLapTime(column.q3, 3)}`}
                  />
                  <TooltipRow name="Clean laps" value={column.cleanLaps} />
                </TooltipFrame>
              )
            }
          />

          <div className="font-data text-muted-foreground flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="bg-foreground inline-block size-2 rotate-45" /> Median
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block w-5 border-t border-dashed"
                style={{ borderColor: REFERENCE }}
              />
              Median connector
            </span>
            {compounds.map(({ compound, color }) => (
              <span key={compound} className="flex items-center gap-1.5">
                <span
                  className="inline-block size-2 rounded-full"
                  style={{ backgroundColor: color }}
                />
                {compound.charAt(0) + compound.slice(1).toLowerCase()}
              </span>
            ))}
          </div>

          <p className="text-muted-foreground text-xs">
            {distribution.cleanLaps} of {distribution.totalLaps} laps shown — lap 1 and laps slower
            than {Math.round(CLEAN_LAP_THRESHOLD * 100)}% of the race median are left out.
            {distribution.excluded.length > 0 && (
              <>
                {' '}
                Not shown (fewer than {MIN_CLEAN_LAPS} clean laps):{' '}
                {distribution.excluded.map((e) => `${e.label} (${e.cleanLaps})`).join(', ')}.
              </>
            )}
          </p>
        </>
      )}
    </div>
  )
}
