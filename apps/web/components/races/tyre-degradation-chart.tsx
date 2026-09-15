'use client'

import { useMemo } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { TYRE_COLORS } from '@/lib/constants'
import type { DegradationResponse } from '@/lib/types'

interface TyreDegradationChartProps {
  data: DegradationResponse
}

function compoundColor(compound: string): string {
  return TYRE_COLORS[compound] ?? TYRE_COLORS.UNKNOWN
}

function formatLapTime(ms: number): string {
  const totalSeconds = ms / 1000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes > 0 ? `${minutes}:${seconds.toFixed(3).padStart(6, '0')}` : seconds.toFixed(3)
}

/** A gradient in ms/lap, said the way a commentator would. */
function formatDegradation(msPerLap: number | null): string {
  if (msPerLap === null) return 'not enough laps'
  const perLap = (msPerLap / 1000).toFixed(3)
  const sign = msPerLap >= 0 ? '+' : ''
  return `${sign}${perLap}s per lap`
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
  const entries = payload.filter((p) => p.value != null)
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
      <p className="text-muted-foreground mb-1 text-xs">Tyre age: {label} laps</p>
      {entries.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2">
          <span
            className="inline-block size-2.5 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-sm capitalize">{entry.dataKey.toLowerCase()}</span>
          <span className="text-muted-foreground ml-auto pl-3 text-sm tabular-nums">
            {formatLapTime(entry.value)}
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * Median lap time against tyre age, one line per compound.
 *
 * The x-axis is how old the tyre was, not the lap of the race, so two stints on
 * the same compound stack on top of each other rather than running side by
 * side — which is what makes the slope readable as wear.
 *
 * What is plotted has already been filtered: pit laps, safety-car laps and laps
 * lost in traffic are several seconds off the pace, which is an order of
 * magnitude more than the effect being measured, so the API drops anything
 * slower than 107% of the race's median. The footnote says how much survived,
 * because a compound resting on a handful of laps is a line worth doubting.
 */
export function TyreDegradationChart({ data }: TyreDegradationChartProps) {
  const { rows, compounds } = useMemo(() => {
    const compounds = data.compounds.filter((c) => c.points.length > 0)
    const ages = new Set<number>()
    for (const compound of compounds) {
      for (const point of compound.points) ages.add(point.tyreLife)
    }

    const rows = [...ages]
      .sort((a, b) => a - b)
      .map((age) => {
        const row: Record<string, number | null> = { tyreLife: age }
        for (const compound of compounds) {
          const point = compound.points.find((p) => p.tyreLife === age)
          row[compound.compound] = point ? point.medianMs : null
        }
        return row
      })

    return { rows, compounds }
  }, [data])

  if (compounds.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No tyre data available for this race. Compound and tyre age come from Fast-F1, which covers
        2018 onwards.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        {compounds.map((compound) => (
          <div
            key={compound.compound}
            className="border-border rounded-lg border bg-[var(--surface-1)] px-3 py-2"
          >
            <div className="flex items-center gap-2">
              <span
                className="inline-block size-2.5 rounded-full"
                style={{ backgroundColor: compoundColor(compound.compound) }}
              />
              <span className="text-xs font-medium capitalize">
                {compound.compound.toLowerCase()}
              </span>
            </div>
            <p className="mt-1 text-sm tabular-nums">
              {formatDegradation(compound.degradationMsPerLap)}
            </p>
            <p className="text-muted-foreground text-xs">{compound.laps} laps</p>
          </div>
        ))}
      </div>

      <div className="h-[24rem] w-full" role="img" aria-label="Tyre degradation chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ left: 10, right: 20, top: 10, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 5%)" />
            <XAxis
              dataKey="tyreLife"
              type="number"
              domain={[1, 'dataMax']}
              tick={{ fontSize: 12, fill: 'oklch(0.5 0 0)' }}
              tickLine={{ stroke: 'oklch(0.3 0 0)' }}
              axisLine={{ stroke: 'oklch(0.3 0 0)' }}
              label={{
                value: 'Tyre age (laps)',
                position: 'insideBottom',
                offset: -10,
                fontSize: 12,
                fill: 'oklch(0.5 0 0)',
              }}
            />
            <YAxis
              type="number"
              domain={['dataMin - 500', 'dataMax + 500']}
              tick={{ fontSize: 11, fill: 'oklch(0.5 0 0)' }}
              tickLine={{ stroke: 'oklch(0.3 0 0)' }}
              axisLine={{ stroke: 'oklch(0.3 0 0)' }}
              tickFormatter={formatLapTime}
              width={65}
              label={{
                value: 'Median lap time',
                angle: -90,
                position: 'insideLeft',
                offset: 5,
                fontSize: 12,
                fill: 'oklch(0.5 0 0)',
              }}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'oklch(1 0 0 / 15%)' }} />
            <Legend
              formatter={(value: string) => (
                <span className="text-muted-foreground text-xs capitalize">
                  {value.toLowerCase()}
                </span>
              )}
            />
            {compounds.map((compound) => (
              <Line
                key={compound.compound}
                type="monotone"
                dataKey={compound.compound}
                stroke={compoundColor(compound.compound)}
                strokeWidth={2}
                dot={{ r: 2 }}
                connectNulls
                animationDuration={400}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="text-muted-foreground text-xs">
        {data.cleanLaps} of {data.totalLaps} laps counted. Anything slower than 107% of the
        race&apos;s median lap — pit laps, safety-car laps, laps in traffic — is left out, along
        with lap 1, because those swamp the wear this is measuring.
      </p>
    </div>
  )
}
