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
import { axisProps, gridProps } from '@/lib/chart-theme'
import { teamColorOf } from '@/lib/utils'
import type { DriverStanding } from '@/lib/types'

interface PointsBarChartProps {
  standings: DriverStanding[]
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
    <div className="chart-tooltip">
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

export function PointsBarChart({ standings }: PointsBarChartProps) {
  const data = standings.slice(0, 10).map((s) => ({
    name: s.driver.lastName,
    points: s.points,
    color: teamColorOf(s.constructor?.color)!,
  }))

  if (data.length === 0) return null

  return (
    <div className="mb-6 h-72 w-full" role="img" aria-label="Driver points bar chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
          <CartesianGrid {...gridProps} horizontal={false} />
          <XAxis type="number" {...axisProps} />
          <YAxis type="category" dataKey="name" width={85} {...axisProps} />
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
