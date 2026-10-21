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
import { axisProps, gridProps, NEUTRAL } from '@/lib/chart-theme'
import { teamColorOf } from '@/lib/utils'
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
    <div className="chart-tooltip max-w-xs">
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
          <CartesianGrid {...gridProps} />
          <XAxis
            dataKey="round"
            {...axisProps}
            label={{
              value: 'Round',
              position: 'insideBottom',
              offset: -2,
              fontSize: 11,
              fill: NEUTRAL,
            }}
          />
          <YAxis {...axisProps} width={50} />
          <Tooltip content={<CustomTooltip />} />
          {items.map((entry) => {
            const color = teamColorOf(entry.color)!
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
              />
            )
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
