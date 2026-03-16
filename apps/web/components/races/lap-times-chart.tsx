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
import { getTeamColor } from '@/lib/utils'
import type { DriverLaps } from '@/lib/types'

interface LapTimesChartProps {
  drivers: DriverLaps[]
}

function formatSeconds(s: number): string {
  const minutes = Math.floor(s / 60)
  const secs = s % 60
  if (minutes > 0) {
    return `${minutes}:${secs.toFixed(3).padStart(6, '0')}`
  }
  return secs.toFixed(3)
}

function getDriverColor(driver: DriverLaps): string {
  return getTeamColor(driver.constructor.ref, driver.constructor.color)!
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

  const validEntries = payload.filter((p) => p.value != null)
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
      <p className="text-muted-foreground mb-1 text-xs">Lap {label}</p>
      {validEntries.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2">
          <span
            className="inline-block size-2.5 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-sm">{entry.dataKey}</span>
          <span className="text-muted-foreground ml-auto pl-3 text-sm tabular-nums">
            {formatSeconds(entry.value)}
          </span>
        </div>
      ))}
    </div>
  )
}

export function LapTimesChart({ drivers }: LapTimesChartProps) {
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

  const { data, activeDrivers, yDomain } = useMemo(() => {
    const activeDrivers = drivers.filter((d) => enabledDrivers.has(d.driver.ref))
    const maxLap = Math.max(...activeDrivers.flatMap((d) => d.laps.map((l) => l.lapNumber)), 0)

    const allTimes: number[] = []
    const data: Record<string, number | null>[] = []
    for (let lap = 1; lap <= maxLap; lap++) {
      const row: Record<string, number | null> = { lap }
      for (const d of activeDrivers) {
        const l = d.laps.find((x) => x.lapNumber === lap)
        const t = l?.timeMs != null ? l.timeMs / 1000 : null
        row[d.driver.lastName] = t
        if (t != null) allTimes.push(t)
      }
      data.push(row)
    }

    let yDomain: [number, number] = [0, 1]
    if (allTimes.length > 0) {
      const min = Math.min(...allTimes)
      const max = Math.max(...allTimes)
      const padding = (max - min) * 0.05 || 1
      yDomain = [Math.floor(min - padding), Math.ceil(max + padding)]
    }

    return { data, activeDrivers, yDomain }
  }, [drivers, enabledDrivers])

  if (drivers.length === 0) {
    return <p className="text-muted-foreground text-sm">No lap time data available.</p>
  }

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
        <div className="h-[28rem] w-full" role="img" aria-label="Lap times chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ left: 10, right: 20, top: 10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 5%)" />
              <XAxis
                dataKey="lap"
                type="number"
                domain={[1, 'dataMax']}
                tick={{ fontSize: 12, fill: 'oklch(0.5 0 0)' }}
                tickLine={{ stroke: 'oklch(0.3 0 0)' }}
                axisLine={{ stroke: 'oklch(0.3 0 0)' }}
                label={{
                  value: 'Lap Number',
                  position: 'insideBottom',
                  offset: -10,
                  fontSize: 12,
                  fill: 'oklch(0.5 0 0)',
                }}
              />
              <YAxis
                type="number"
                domain={yDomain}
                tick={{ fontSize: 11, fill: 'oklch(0.5 0 0)' }}
                tickLine={{ stroke: 'oklch(0.3 0 0)' }}
                axisLine={{ stroke: 'oklch(0.3 0 0)' }}
                tickFormatter={(v) => formatSeconds(v)}
                width={65}
                label={{
                  value: 'Lap Time',
                  angle: -90,
                  position: 'insideLeft',
                  offset: 5,
                  fontSize: 12,
                  fill: 'oklch(0.5 0 0)',
                }}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'oklch(1 0 0 / 15%)' }} />
              {activeDrivers.map((d) => (
                <Line
                  key={d.driver.ref}
                  type="monotone"
                  dataKey={d.driver.lastName}
                  stroke={getDriverColor(d)}
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls={false}
                  animationDuration={400}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
