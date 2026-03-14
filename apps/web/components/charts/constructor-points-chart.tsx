'use client'

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
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
          <XAxis type="number" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
          <YAxis
            type="category"
            dataKey="name"
            width={100}
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
