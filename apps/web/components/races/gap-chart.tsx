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
import { RaceControlLegend, safetyCarAreas } from '@/components/races/race-control-overlay'
import type { DriverGaps, RaceControlPeriod } from '@/lib/types'

interface GapChartProps {
  periods?: RaceControlPeriod[]
  drivers: DriverGaps[]
  totalLaps: number
}

const DEFAULT_VISIBLE = 5

function driverColor(driver: DriverGaps): string {
  return getTeamColor(driver.constructor.ref, driver.constructor.color)!
}

function driverLabel(driver: DriverGaps): string {
  return driver.driver.code ?? driver.driver.lastName.slice(0, 3).toUpperCase()
}

function formatGap(ms: number): string {
  if (ms === 0) return 'Leader'
  const seconds = ms / 1000
  return seconds >= 60
    ? `+${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, '0')}`
    : `+${seconds.toFixed(1)}s`
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

  const entries = payload.filter((p) => p.value != null).sort((a, b) => a.value - b.value)
  if (entries.length === 0) return null

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
      {entries.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2">
          <span
            className="inline-block size-2.5 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-sm">{entry.dataKey}</span>
          <span className="text-muted-foreground ml-auto pl-3 text-sm tabular-nums">
            {formatGap(entry.value * 1000)}
          </span>
        </div>
      ))}
    </div>
  )
}

export function GapChart({ drivers, totalLaps, periods }: GapChartProps) {
  const [enabled, setEnabled] = useState<Set<string>>(
    () => new Set(drivers.slice(0, DEFAULT_VISIBLE).map((d) => d.driver.ref)),
  )

  function toggle(ref: string) {
    setEnabled((prev) => {
      const next = new Set(prev)
      if (next.has(ref)) next.delete(ref)
      else next.add(ref)
      return next
    })
  }

  const { data, active } = useMemo(() => {
    const active = drivers.filter((d) => enabled.has(d.driver.ref))

    const rows: Record<string, number | null>[] = []
    for (let lap = 1; lap <= totalLaps; lap++) {
      const row: Record<string, number | null> = { lap }
      for (const d of active) {
        const gap = d.gaps.find((g) => g.lap === lap)
        // Seconds, not milliseconds: the axis is read by humans.
        row[driverLabel(d)] = gap ? gap.gapMs / 1000 : null
      }
      rows.push(row)
    }
    return { data: rows, active }
  }, [drivers, enabled, totalLaps])

  if (drivers.length === 0) {
    return <p className="text-muted-foreground text-sm">No gap data available for this race.</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {drivers.map((d) => {
          const color = driverColor(d)
          const isOn = enabled.has(d.driver.ref)
          return (
            <button
              key={d.driver.ref}
              onClick={() => toggle(d.driver.ref)}
              aria-pressed={isOn}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                isOn
                  ? 'border-transparent text-white'
                  : 'border-border text-muted-foreground opacity-50 hover:opacity-75'
              }`}
              style={isOn ? { backgroundColor: color } : undefined}
            >
              {driverLabel(d)}
            </button>
          )
        })}
      </div>

      <div className="h-[26rem] w-full" role="img" aria-label="Gap to race leader by lap">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: 10, right: 20, top: 10, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 5%)" />
            <XAxis
              dataKey="lap"
              type="number"
              domain={[1, totalLaps]}
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
              // Leader pinned at the top: a bigger gap means further behind.
              reversed
              tick={{ fontSize: 11, fill: 'oklch(0.5 0 0)' }}
              tickLine={{ stroke: 'oklch(0.3 0 0)' }}
              axisLine={{ stroke: 'oklch(0.3 0 0)' }}
              tickFormatter={(v) => `${v}s`}
              width={52}
              label={{
                value: 'Gap to leader',
                angle: -90,
                position: 'insideLeft',
                offset: 0,
                fontSize: 12,
                fill: 'oklch(0.5 0 0)',
              }}
            />
            {safetyCarAreas(periods)}
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'oklch(1 0 0 / 15%)' }} />
            {active.map((d) => (
              <Line
                key={d.driver.ref}
                type="linear"
                dataKey={driverLabel(d)}
                stroke={driverColor(d)}
                strokeWidth={2}
                dot={false}
                connectNulls={false}
                animationDuration={400}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <RaceControlLegend periods={periods} />

      <p className="text-muted-foreground text-xs">
        Cumulative time behind whoever leads on that lap. Every line drops when that driver pits and
        rises together when the leader does, so the sawtooth is the pit-stop cycle. A line that ends
        early is a retirement.
      </p>
    </div>
  )
}
