'use client'

import { useMemo } from 'react'
import { TYRE_COLORS } from '@/lib/constants'
import type { DriverLaps } from '@/lib/types'

interface TyreStrategyChartProps {
  drivers: DriverLaps[]
}

interface Stint {
  compound: string
  startLap: number
  endLap: number
  laps: number
}

function getCompoundInitial(compound: string): string {
  const map: Record<string, string> = {
    SOFT: 'S',
    MEDIUM: 'M',
    HARD: 'H',
    INTERMEDIATE: 'I',
    WET: 'W',
  }
  return map[compound] ?? '?'
}

function getTextColor(compound: string): string {
  // Dark text for light compounds, white for dark compounds
  if (compound === 'MEDIUM' || compound === 'HARD') return '#000000'
  return '#FFFFFF'
}

export function TyreStrategyChart({ drivers }: TyreStrategyChartProps) {
  const driverStints = useMemo(() => {
    return drivers.map((d) => {
      const stints: Stint[] = []
      let currentCompound: string | null = null
      let startLap = 1

      for (const lap of d.laps) {
        const compound = lap.compound ?? 'UNKNOWN'
        if (compound !== currentCompound) {
          if (currentCompound !== null) {
            stints.push({
              compound: currentCompound,
              startLap,
              endLap: lap.lapNumber - 1,
              laps: lap.lapNumber - startLap,
            })
          }
          currentCompound = compound
          startLap = lap.lapNumber
        }
      }

      // Push final stint
      if (currentCompound !== null && d.laps.length > 0) {
        const lastLap = d.laps[d.laps.length - 1].lapNumber
        stints.push({
          compound: currentCompound,
          startLap,
          endLap: lastLap,
          laps: lastLap - startLap + 1,
        })
      }

      return { driver: d, stints }
    })
  }, [drivers])

  const maxLaps = Math.max(...drivers.flatMap((d) => d.laps.map((l) => l.lapNumber)), 1)

  if (drivers.length === 0) {
    return <p className="text-muted-foreground text-sm">No tyre strategy data available.</p>
  }

  return (
    <div className="space-y-1.5">
      {driverStints.map(({ driver, stints }) => (
        <div key={driver.driver.ref} className="flex items-center gap-3">
          <span className="text-muted-foreground w-16 shrink-0 truncate text-right text-xs font-medium">
            {driver.driver.code ?? driver.driver.lastName.slice(0, 3).toUpperCase()}
          </span>
          <div className="flex h-7 flex-1 overflow-hidden rounded">
            {stints.map((stint, i) => {
              const width = (stint.laps / maxLaps) * 100
              const bgColor = TYRE_COLORS[stint.compound] ?? TYRE_COLORS.UNKNOWN
              const textColor = getTextColor(stint.compound)
              return (
                <div
                  key={i}
                  className="border-background/30 flex items-center justify-center border-r text-xs font-bold last:border-r-0"
                  style={{
                    width: `${width}%`,
                    backgroundColor: bgColor,
                    color: textColor,
                    minWidth: '16px',
                  }}
                  title={`${stint.compound} — Laps ${stint.startLap}-${stint.endLap} (${stint.laps} laps)`}
                >
                  {width > 4 && getCompoundInitial(stint.compound)}
                </div>
              )
            })}
          </div>
          <span className="text-muted-foreground w-8 shrink-0 text-right text-xs tabular-nums">
            {driver.laps.length > 0 ? driver.laps[driver.laps.length - 1].lapNumber : 0}
          </span>
        </div>
      ))}
      {/* Legend */}
      <div className="flex flex-wrap gap-3 pt-3">
        {['SOFT', 'MEDIUM', 'HARD', 'INTERMEDIATE', 'WET'].map((compound) => (
          <div key={compound} className="flex items-center gap-1.5">
            <span
              className="inline-block size-3 rounded-sm"
              style={{ backgroundColor: TYRE_COLORS[compound] }}
            />
            <span className="text-muted-foreground text-xs capitalize">
              {compound.toLowerCase()}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
