'use client'

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { DriverPaceSeason } from '@/lib/types'

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null

  const qualiEntry = payload.find((p) => p.name === 'Qualifying')
  const raceEntry = payload.find((p) => p.name === 'Race')

  return (
    <div
      className="rounded-xl px-3 py-2"
      style={{
        backgroundColor: 'oklch(0.13 0.003 250 / 85%)',
        border: '1px solid oklch(1 0 0 / 10%)',
        color: 'oklch(0.95 0 0)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <p className="text-sm font-medium">{label} Season</p>
      {qualiEntry && (
        <p className="text-muted-foreground mt-0.5 text-sm tabular-nums">
          <span
            className="mr-1.5 inline-block size-2 rounded-full"
            style={{ backgroundColor: qualiEntry.color }}
          />
          Avg Quali: P{qualiEntry.value.toFixed(1)}
        </p>
      )}
      {raceEntry && (
        <p className="text-muted-foreground text-sm tabular-nums">
          <span
            className="mr-1.5 inline-block size-2 rounded-full"
            style={{ backgroundColor: raceEntry.color }}
          />
          Avg Race: P{raceEntry.value.toFixed(1)}
        </p>
      )}
      {qualiEntry && raceEntry && (
        <p className="text-muted-foreground mt-1 text-xs">
          {raceEntry.value < qualiEntry.value
            ? `Gains ${(qualiEntry.value - raceEntry.value).toFixed(1)} positions on avg`
            : raceEntry.value > qualiEntry.value
              ? `Loses ${(raceEntry.value - qualiEntry.value).toFixed(1)} positions on avg`
              : 'No position change on avg'}
        </p>
      )}
    </div>
  )
}

interface QualiVsRaceChartProps {
  seasons: DriverPaceSeason[]
  color?: string
}

export function QualiVsRaceChart({ seasons, color = '#E8002D' }: QualiVsRaceChartProps) {
  // Filter to seasons that have both qualifying and race data
  const data = seasons
    .filter((s) => s.avgQualiPosition !== null && s.avgRacePosition !== null)
    .map((s) => ({
      year: s.year,
      quali: s.avgQualiPosition,
      race: s.avgRacePosition,
    }))

  if (data.length < 2) return null

  const raceColor = '#3B82F6'

  return (
    <div className="h-72 w-full" role="img" aria-label="Qualifying vs race pace chart">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
          <defs>
            <linearGradient id="qualiRaceGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.1} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 6%)" />
          <XAxis dataKey="year" tick={{ fontSize: 12, fill: 'oklch(0.6 0 0)' }} />
          <YAxis
            reversed
            tick={{ fontSize: 12, fill: 'oklch(0.6 0 0)' }}
            tickFormatter={(v) => `P${v}`}
            width={45}
            domain={['dataMin - 1', 'dataMax + 1']}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 13 }}
            formatter={(value) => <span style={{ color: 'oklch(0.7 0 0)' }}>{value}</span>}
          />
          <Area
            type="monotone"
            dataKey="quali"
            stroke="none"
            fill="url(#qualiRaceGradient)"
            name="Qualifying"
          />
          <Line
            type="monotone"
            dataKey="quali"
            stroke={color}
            strokeWidth={2}
            dot={{ r: 3, fill: color }}
            name="Qualifying"
            connectNulls
            style={{ filter: `drop-shadow(0 0 4px ${color}80)` }}
          />
          <Line
            type="monotone"
            dataKey="race"
            stroke={raceColor}
            strokeWidth={2}
            dot={{ r: 3, fill: raceColor }}
            name="Race"
            connectNulls
            style={{ filter: `drop-shadow(0 0 4px ${raceColor}80)` }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
