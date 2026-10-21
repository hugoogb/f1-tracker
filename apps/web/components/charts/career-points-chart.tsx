'use client'

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { ChartTooltip } from '@/components/charts/chart-tooltip'
import { axisProps, gridProps, lineCursor, SERIES } from '@/lib/chart-theme'

interface CareerPointsChartProps {
  seasons: { year: number; points: number }[]
  color?: string
}

export function CareerPointsChart({ seasons, color = SERIES[0] }: CareerPointsChartProps) {
  if (seasons.length < 2) return null

  const data = [...seasons].sort((a, b) => a.year - b.year)
  const gradientId = `careerGradient-${color.replace(/[^a-zA-Z0-9]/g, '')}`

  return (
    <div className="mb-6 h-64 w-full" role="img" aria-label="Career points per season">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="year" {...axisProps} />
          <YAxis {...axisProps} width={50} />
          <Tooltip
            cursor={lineCursor}
            content={<ChartTooltip formatLabel={(label) => `${label} season`} />}
          />
          <Area
            type="monotone"
            dataKey="points"
            fill={`url(#${gradientId})`}
            stroke="none"
            tooltipType="none"
          />
          <Line
            type="monotone"
            dataKey="points"
            name="Points"
            stroke={color}
            strokeWidth={2.5}
            dot={{ r: 3, fill: color, strokeWidth: 0 }}
            activeDot={{ r: 6, strokeWidth: 2, stroke: 'var(--background)' }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
