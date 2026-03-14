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
import type { DriverStanding } from '@/lib/types'

interface PointsBarChartProps {
  standings: DriverStanding[]
}

export function PointsBarChart({ standings }: PointsBarChartProps) {
  const data = standings.slice(0, 10).map((s) => ({
    name: s.driver.lastName,
    points: s.points,
    color: s.constructor
      ? (TEAM_COLORS[s.constructor.ref] ?? s.constructor.color ?? '#888888')
      : '#888888',
  }))

  if (data.length === 0) return null

  return (
    <div className="mb-6 h-72 w-full" role="img" aria-label="Driver points bar chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
          <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis type="number" tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} />
          <YAxis
            type="category"
            dataKey="name"
            width={85}
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
