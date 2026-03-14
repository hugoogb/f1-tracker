'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { TEAM_COLORS } from '@/lib/constants'
import type { ConstructorStanding } from '@/lib/types'

interface ConstructorPointsChartProps {
  standings: ConstructorStanding[]
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value: number; payload: { color: string } }>
  label?: string
}) {
  if (!active || !payload?.length) return null

  const { value, payload: item } = payload[0]

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
      <div className="flex items-center gap-2">
        <span
          className="inline-block size-2.5 rounded-full"
          style={{ backgroundColor: item.color }}
        />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <p className="text-muted-foreground mt-0.5 text-sm tabular-nums">{value} pts</p>
    </div>
  )
}

export function ConstructorPointsChart({ standings }: ConstructorPointsChartProps) {
  const data = standings.map((s) => ({
    name: s.constructor.name,
    points: s.points,
    color: TEAM_COLORS[s.constructor.ref] ?? s.constructor.color ?? '#888888',
  }))

  if (data.length === 0) return null

  const barHeight = 28
  const chartHeight = Math.max(200, data.length * barHeight + 40)

  return (
    <div
      className="mb-6 w-full"
      style={{ height: chartHeight }}
      role="img"
      aria-label="Constructor points bar chart"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
          <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="oklch(1 0 0 / 6%)" />
          <XAxis type="number" tick={{ fontSize: 12, fill: 'oklch(0.6 0 0)' }} />
          <YAxis
            type="category"
            dataKey="name"
            width={100}
            tick={{ fontSize: 12, fill: 'oklch(0.6 0 0)' }}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--muted)', opacity: 0.3 }} />
          <Bar dataKey="points" radius={[0, 4, 4, 0]} animationDuration={600}>
            {data.map((entry, index) => (
              <Cell key={index} fill={entry.color} fillOpacity={0.9} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
