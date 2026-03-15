'use client'

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
import type { StandingsProgressionDriver } from '@/lib/types'

interface ChartEntry {
  ref: string
  name?: string
  code?: string | null
  lastName?: string
  color: string | null
}

interface ChampionshipProgressionChartProps {
  rounds: Record<string, number | string>[]
  drivers?: StandingsProgressionDriver[]
  entries?: ChartEntry[]
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{
    name: string
    value: number
    stroke: string
    payload?: Record<string, unknown>
  }>
  label?: string
}) {
  if (!active || !payload?.length) return null

  const raceName = payload[0]?.payload?.raceName as string | undefined

  return (
    <div
      className="max-w-xs rounded-xl px-3 py-2"
      style={{
        backgroundColor: 'oklch(0.13 0.003 250 / 85%)',
        border: '1px solid oklch(1 0 0 / 10%)',
        color: 'oklch(0.95 0 0)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <p className="mb-1 text-xs font-medium">
        R{label} {raceName && `— ${raceName}`}
      </p>
      <div className="space-y-0.5">
        {[...payload]
          .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
          .map((entry) => (
            <div key={entry.name} className="flex items-center justify-between gap-4 text-xs">
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block size-2 rounded-full"
                  style={{ backgroundColor: entry.stroke }}
                />
                {entry.name}
              </span>
              <span className="tabular-nums">{entry.value} pts</span>
            </div>
          ))}
      </div>
    </div>
  )
}

export function ChampionshipProgressionChart({
  rounds,
  drivers,
  entries: entriesProp,
}: ChampionshipProgressionChartProps) {
  // Support both 'drivers' (legacy) and 'entries' (generic) props
  const items: ChartEntry[] = entriesProp ?? drivers ?? []

  if (rounds.length === 0 || items.length === 0) return null

  return (
    <div className="mb-6 h-80 w-full" role="img" aria-label="Championship progression chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rounds} margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 6%)" />
          <XAxis
            dataKey="round"
            tick={{ fontSize: 12, fill: 'oklch(0.6 0 0)' }}
            label={{
              value: 'Round',
              position: 'insideBottom',
              offset: -2,
              fontSize: 11,
              fill: 'oklch(0.5 0 0)',
            }}
          />
          <YAxis tick={{ fontSize: 12, fill: 'oklch(0.6 0 0)' }} width={50} />
          <Tooltip content={<CustomTooltip />} />
          {items.map((entry) => {
            const color = TEAM_COLORS[entry.ref] ?? entry.color ?? '#888888'
            const label = entry.code ?? entry.name ?? entry.lastName ?? entry.ref
            return (
              <Line
                key={entry.ref}
                type="monotone"
                dataKey={entry.ref}
                name={label}
                stroke={color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--background)' }}
                style={{ filter: `drop-shadow(0 0 4px ${color}40)` }}
              />
            )
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
