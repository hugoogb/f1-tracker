'use client'

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
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
          <XAxis type="number" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
          <YAxis
            type="category"
            dataKey="name"
            width={85}
            tick={{ fontSize: 12, fill: 'hsl(var(--foreground))' }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--popover))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '6px',
              color: 'hsl(var(--foreground))',
            }}
          />
          <Bar dataKey="points" radius={[0, 4, 4, 0]}>
            {data.map((entry, index) => (
              <Cell key={index} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
