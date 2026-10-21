'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { SeasonHeatmapResponse } from '@/lib/types'
import { positionHeat } from '@/lib/chart-theme'

function getPositionColor(position: number | null, status: string | null): string {
  if (
    position === null ||
    (status &&
      status !== 'Finished' &&
      status !== '+1 Lap' &&
      status !== '+2 Laps' &&
      status !== '+3 Laps')
  ) {
    return 'color-mix(in oklch, var(--negative) 55%, var(--surface-1))' // DNF
  }
  if (position === 1) return 'var(--gold)'
  if (position === 2) return 'var(--silver)'
  if (position === 3) return 'var(--bronze)'
  return positionHeat(position)
}

function getTextColor(position: number | null): string {
  if (position === null) return 'var(--foreground)'
  if (position <= 3) return 'var(--background)'
  return 'var(--foreground)'
}

interface SeasonHeatmapProps {
  data: SeasonHeatmapResponse
}

export function SeasonHeatmap({ data }: SeasonHeatmapProps) {
  const [hoveredCell, setHoveredCell] = useState<{ driverIdx: number; roundIdx: number } | null>(
    null,
  )

  const roundsMap = useMemo(() => {
    const map = new Map<number, string>()
    for (const r of data.rounds) {
      map.set(r.round, r.name)
    }
    return map
  }, [data.rounds])

  if (data.drivers.length === 0 || data.rounds.length === 0) return null

  return (
    <div className="border-hairline overflow-x-auto rounded-xl border">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className="border-hairline bg-surface-1 text-2xs sticky left-0 z-10 min-w-[100px] border-r border-b px-2 py-2 text-left font-medium">
              Driver
            </th>
            {data.rounds.map((round) => (
              <th
                key={round.round}
                className="border-hairline text-2xs border-b px-0 py-2 text-center font-medium"
                title={round.name}
              >
                R{round.round}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.drivers.map((driver, driverIdx) => {
            const resultsByRound = new Map(driver.results.map((r) => [r.round, r]))
            return (
              <tr key={driver.driver.ref}>
                <td className="border-hairline bg-surface-1 sticky left-0 z-10 border-r px-2 py-1.5">
                  <div className="flex items-center gap-1.5">
                    {driver.constructor.color && (
                      <span
                        className="inline-block h-3 w-1 shrink-0 rounded-full"
                        style={{ backgroundColor: driver.constructor.color }}
                      />
                    )}
                    <Link
                      href={`/drivers/${driver.driver.ref}`}
                      className="hover:text-primary truncate font-medium transition-colors"
                    >
                      {driver.driver.code ?? driver.driver.lastName.slice(0, 3).toUpperCase()}
                    </Link>
                  </div>
                </td>
                {data.rounds.map((round, roundIdx) => {
                  const result = resultsByRound.get(round.round)
                  const isHovered =
                    hoveredCell?.driverIdx === driverIdx && hoveredCell?.roundIdx === roundIdx
                  const bgColor = result
                    ? getPositionColor(result.position, result.status)
                    : 'transparent'
                  const textColor = result ? getTextColor(result.position) : 'var(--label)'

                  return (
                    <td
                      key={round.round}
                      className="border-hairline relative px-0 py-0 text-center"
                      onMouseEnter={() => setHoveredCell({ driverIdx, roundIdx })}
                      onMouseLeave={() => setHoveredCell(null)}
                    >
                      <div
                        className="text-2xs flex h-7 w-full items-center justify-center font-bold tabular-nums transition-opacity"
                        style={{
                          backgroundColor: bgColor,
                          color: textColor,
                          opacity: result ? 1 : 0.15,
                        }}
                      >
                        {result ? result.positionText : ''}
                      </div>
                      {/* Tooltip */}
                      {isHovered && result && (
                        <div className="chart-tooltip pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 text-left whitespace-nowrap">
                          <p className="text-xs font-medium">{roundsMap.get(round.round)}</p>
                          <p className="text-muted-foreground text-2xs mt-0.5">
                            P{result.positionText} · {result.points} pts
                            {result.status && result.status !== 'Finished' && ` · ${result.status}`}
                          </p>
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
