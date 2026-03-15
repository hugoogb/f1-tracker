'use client'

import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { TEAM_COLORS } from '@/lib/constants'
import type { DriverPositions } from '@/lib/types'

interface PositionChartProps {
  drivers: DriverPositions[]
  totalLaps: number
}

function getDriverColor(driver: DriverPositions): string {
  return TEAM_COLORS[driver.constructor.ref] ?? driver.constructor.color ?? '#888888'
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value: number; dataKey: string; color: string }>
  label?: number
}) {
  if (!active || !payload?.length) return null

  const validEntries = payload.filter((p) => p.value != null).sort((a, b) => a.value - b.value)

  if (validEntries.length === 0) return null

  return (
    <div
      className="rounded-xl px-3 py-2"
      style={{
        backgroundColor: 'oklch(0.13 0.003 250 / 90%)',
        border: '1px solid oklch(1 0 0 / 10%)',
        color: 'oklch(0.95 0 0)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <p className="text-muted-foreground mb-1 text-xs">{label === 0 ? 'Grid' : `Lap ${label}`}</p>
      {validEntries.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2">
          <span
            className="inline-block size-2.5 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-sm">{entry.dataKey}</span>
          <span className="text-muted-foreground ml-auto pl-3 text-sm tabular-nums">
            P{entry.value}
          </span>
        </div>
      ))}
    </div>
  )
}

export function PositionChart({ drivers, totalLaps }: PositionChartProps) {
  const [enabledDrivers, setEnabledDrivers] = useState<Set<string>>(() => {
    return new Set(drivers.slice(0, 5).map((d) => d.driver.ref))
  })

  const toggleDriver = (ref: string) => {
    setEnabledDrivers((prev) => {
      const next = new Set(prev)
      if (next.has(ref)) {
        next.delete(ref)
      } else {
        next.add(ref)
      }
      return next
    })
  }

  const { data, activeDrivers } = useMemo(() => {
    const activeDrivers = drivers.filter((d) => enabledDrivers.has(d.driver.ref))

    const data: Record<string, number | null>[] = []
    for (let lap = 0; lap <= totalLaps; lap++) {
      const row: Record<string, number | null> = { lap }
      for (const d of activeDrivers) {
        const pos = d.positions.find((p) => p.lap === lap)
        row[d.driver.lastName] = pos?.position ?? null
      }
      data.push(row)
    }

    return { data, activeDrivers }
  }, [drivers, enabledDrivers, totalLaps])

  if (drivers.length === 0) {
    return <p className="text-muted-foreground text-sm">No position data available.</p>
  }

  const maxPosition = Math.max(...drivers.flatMap((d) => d.positions.map((p) => p.position)), 20)

  return (
    <div className="space-y-4">
      {/* Driver toggles */}
      <div className="flex flex-wrap gap-2">
        {drivers.map((d) => {
          const color = getDriverColor(d)
          const active = enabledDrivers.has(d.driver.ref)
          return (
            <button
              key={d.driver.ref}
              onClick={() => toggleDriver(d.driver.ref)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                active
                  ? 'border-transparent text-white'
                  : 'border-border text-muted-foreground opacity-50 hover:opacity-75'
              }`}
              style={active ? { backgroundColor: color } : undefined}
            >
              {d.driver.code ?? d.driver.lastName.slice(0, 3).toUpperCase()}
            </button>
          )
        })}
      </div>

      {data.length > 0 && (
        <div className="h-[28rem] w-full" role="img" aria-label="Race positions chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ left: 10, right: 20, top: 10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 5%)" />
              <XAxis
                dataKey="lap"
                type="number"
                domain={[0, totalLaps]}
                tick={{ fontSize: 12, fill: 'oklch(0.5 0 0)' }}
                tickLine={{ stroke: 'oklch(0.3 0 0)' }}
                axisLine={{ stroke: 'oklch(0.3 0 0)' }}
                label={{
                  value: 'Lap',
                  position: 'insideBottom',
                  offset: -10,
                  fontSize: 12,
                  fill: 'oklch(0.5 0 0)',
                }}
              />
              <YAxis
                type="number"
                domain={[1, Math.min(maxPosition, 20)]}
                reversed
                tick={{ fontSize: 11, fill: 'oklch(0.5 0 0)' }}
                tickLine={{ stroke: 'oklch(0.3 0 0)' }}
                axisLine={{ stroke: 'oklch(0.3 0 0)' }}
                tickFormatter={(v) => `P${v}`}
                width={40}
                label={{
                  value: 'Position',
                  angle: -90,
                  position: 'insideLeft',
                  offset: 10,
                  fontSize: 12,
                  fill: 'oklch(0.5 0 0)',
                }}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'oklch(1 0 0 / 15%)' }} />
              {activeDrivers.map((d) => (
                <Line
                  key={d.driver.ref}
                  type="linear"
                  dataKey={d.driver.lastName}
                  stroke={getDriverColor(d)}
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                  animationDuration={400}
                  style={{ filter: `drop-shadow(0 0 4px ${getDriverColor(d)}80)` }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
