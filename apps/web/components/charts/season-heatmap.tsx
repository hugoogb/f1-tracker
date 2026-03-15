'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { SeasonHeatmapResponse } from '@/lib/types'

function getPositionColor(position: number | null, status: string | null): string {
  if (
    position === null ||
    (status &&
      status !== 'Finished' &&
      status !== '+1 Lap' &&
      status !== '+2 Laps' &&
      status !== '+3 Laps')
  ) {
    return 'oklch(0.45 0.15 25)' // Red-ish for DNF
  }
  if (position === 1) return 'oklch(0.8 0.15 85)' // Gold
  if (position === 2) return 'oklch(0.7 0.02 250)' // Silver
  if (position === 3) return 'oklch(0.6 0.12 55)' // Bronze
  if (position <= 10) {
    // Green to yellow gradient for points positions
    const t = (position - 4) / 6
    const l = 0.55 - t * 0.1
    const c = 0.12 - t * 0.02
    const h = 145 - t * 50
    return `oklch(${l} ${c} ${h})`
  }
  // P11+: fade to gray
  const t = Math.min((position - 11) / 10, 1)
  const l = 0.4 - t * 0.1
  return `oklch(${l} 0.02 250)`
}

function getTextColor(position: number | null): string {
  if (position === null) return 'oklch(0.95 0 0)'
  if (position <= 3) return 'oklch(0.15 0 0)'
  return 'oklch(0.95 0 0)'
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
    <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 min-w-[100px] border-r border-b border-[var(--border)] bg-[var(--surface-1)] px-2 py-2 text-left text-[11px] font-medium">
              Driver
            </th>
            {data.rounds.map((round) => (
              <th
                key={round.round}
                className="border-b border-[var(--border)] px-0 py-2 text-center text-[10px] font-medium"
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
                <td className="sticky left-0 z-10 border-r border-[var(--border)] bg-[var(--surface-1)] px-2 py-1.5">
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
                  const textColor = result ? getTextColor(result.position) : 'oklch(0.4 0 0)'

                  return (
                    <td
                      key={round.round}
                      className="relative border-[var(--border)] px-0 py-0 text-center"
                      onMouseEnter={() => setHoveredCell({ driverIdx, roundIdx })}
                      onMouseLeave={() => setHoveredCell(null)}
                    >
                      <div
                        className="flex h-7 w-full items-center justify-center text-[11px] font-bold tabular-nums transition-opacity"
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
                        <div
                          className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 rounded-lg px-3 py-2 text-left whitespace-nowrap"
                          style={{
                            backgroundColor: 'oklch(0.13 0.003 250 / 95%)',
                            border: '1px solid oklch(1 0 0 / 10%)',
                            color: 'oklch(0.95 0 0)',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                            backdropFilter: 'blur(12px)',
                          }}
                        >
                          <p className="text-xs font-medium">{roundsMap.get(round.round)}</p>
                          <p className="text-muted-foreground mt-0.5 text-[11px]">
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
