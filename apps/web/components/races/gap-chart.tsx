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
import { teamColorOf } from '@/lib/utils'
import type { DriverGaps } from '@/lib/types'

interface GapChartProps {
  drivers: DriverGaps[]
  totalLaps: number
  coveredLaps: number
}

const DEFAULT_DRIVERS = 6

/** Seconds behind, the way a pit wall says it: "+1.4", "+12.8". */
function formatGap(seconds: number): string {
  if (seconds === 0) return 'Leader'
  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60)
    return `+${minutes}:${(seconds % 60).toFixed(1).padStart(4, '0')}`
  }
  return `+${seconds.toFixed(1)}s`
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
            {formatGap(entry.value)}
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * Every driver's gap to the leader, lap by lap.
 *
 * The y-axis is inverted so the leader's flat line sits at the top and
 * everyone else hangs below it: the chart reads downwards as time lost, which
 * is the way the gap is talked about.
 *
 * Gaps only compare drivers on the same lap of the race. Someone a lap down has
 * a lower elapsed time at their own lap 40 than the leader does, so their line
 * dives rather than climbing — the note under the chart says when the data
 * stops short, which is the case that usually explains a line ending early.
 */
export function GapChart({ drivers, totalLaps, coveredLaps }: GapChartProps) {
  const [enabled, setEnabled] = useState<Set<string>>(
    () => new Set(drivers.slice(0, DEFAULT_DRIVERS).map((d) => d.driver.ref)),
  )

  const toggle = (ref: string) =>
    setEnabled((prev) => {
      const next = new Set(prev)
      if (next.has(ref)) next.delete(ref)
      else next.add(ref)
      return next
    })

  const { data, active, yMax } = useMemo(() => {
    const active = drivers.filter((d) => enabled.has(d.driver.ref))
    const maxLap = Math.max(...active.flatMap((d) => d.gaps.map((g) => g.lap)), 0)

    const rows: Record<string, number | null>[] = []
    let yMax = 0
    for (let lap = 1; lap <= maxLap; lap++) {
      const row: Record<string, number | null> = { lap }
      for (const d of active) {
        const gap = d.gaps.find((g) => g.lap === lap)
        const seconds = gap ? gap.gapMs / 1000 : null
        row[d.driver.lastName] = seconds
        if (seconds != null && seconds > yMax) yMax = seconds
      }
      rows.push(row)
    }

    return { data: rows, active, yMax: Math.ceil(yMax * 1.05) || 1 }
  }, [drivers, enabled])

  if (drivers.length === 0) {
    return <p className="text-muted-foreground text-sm">No gap data available for this race.</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {drivers.map((d) => {
          const color = teamColorOf(d.constructor.color)!
          const on = enabled.has(d.driver.ref)
          return (
            <button
              key={d.driver.ref}
              onClick={() => toggle(d.driver.ref)}
              aria-pressed={on}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                on
                  ? 'border-transparent text-white'
                  : 'border-border text-muted-foreground opacity-50 hover:opacity-75'
              }`}
              style={on ? { backgroundColor: color } : undefined}
            >
              {d.driver.code ?? d.driver.lastName.slice(0, 3).toUpperCase()}
            </button>
          )
        })}
      </div>

      {data.length > 0 && (
        <div className="h-[28rem] w-full" role="img" aria-label="Gap to leader chart">
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
                // Reversed: the leader is the top of the chart, and falling
                // behind moves a line downwards.
                domain={[0, yMax]}
                reversed
                tick={{ fontSize: 11, fill: 'oklch(0.5 0 0)' }}
                tickLine={{ stroke: 'oklch(0.3 0 0)' }}
                axisLine={{ stroke: 'oklch(0.3 0 0)' }}
                tickFormatter={(v) => `${v}s`}
                width={55}
                label={{
                  value: 'Gap to leader',
                  angle: -90,
                  position: 'insideLeft',
                  offset: 5,
                  fontSize: 12,
                  fill: 'oklch(0.5 0 0)',
                }}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'oklch(1 0 0 / 15%)' }} />
              {active.map((d) => (
                <Line
                  key={d.driver.ref}
                  type="monotone"
                  dataKey={d.driver.lastName}
                  stroke={teamColorOf(d.constructor.color)!}
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

      {coveredLaps > 0 && coveredLaps < totalLaps && (
        <p className="text-muted-foreground text-xs">
          Timing data covers {coveredLaps} of {totalLaps} laps. A driver&apos;s line ends at the
          first lap their timing is missing, because a gap cannot be carried across one.
        </p>
      )}
    </div>
  )
}
