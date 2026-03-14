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

export function ConstructorPointsChart({ standings }: ConstructorPointsChartProps) {
  const data = standings.slice(0, 10).map((s) => ({
    name: s.constructor.name,
    points: s.points,
    color: TEAM_COLORS[s.constructor.ref] ?? s.constructor.color ?? '#888888',
  }))

  if (data.length === 0) return null

  return (
    <div className="mb-6 h-72 w-full" role="img" aria-label="Constructor points bar chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
          <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis type="number" tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} />
          <YAxis
            type="category"
            dataKey="name"
            width={100}
            tick={{ fontSize: 12, fill: 'var(--foreground)' }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--popover)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              color: 'var(--foreground)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              padding: '8px 12px',
            }}
            cursor={{ fill: 'var(--muted)', opacity: 0.3 }}
          />
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
