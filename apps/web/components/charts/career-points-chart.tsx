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

interface CareerPointsChartProps {
  seasons: { year: number; points: number }[]
  color?: string
}

export function CareerPointsChart({ seasons, color = '#E8002D' }: CareerPointsChartProps) {
  if (seasons.length < 2) return null

  const data = [...seasons].sort((a, b) => a.year - b.year)

  return (
    <div className="mb-6 h-64 w-full" role="img" aria-label="Career points per season">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
          <defs>
            <linearGradient
              id={`areaGradient-${color.replace('#', '')}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor={color} stopOpacity={0.2} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="year" tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} />
          <YAxis tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} width={50} />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--popover)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              color: 'var(--foreground)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              padding: '8px 12px',
            }}
            formatter={(value) => [String(value), 'Points']}
            labelFormatter={(label) => `${label} Season`}
          />
          <Area
            type="monotone"
            dataKey="points"
            fill={`url(#areaGradient-${color.replace('#', '')})`}
            stroke="none"
            tooltipType="none"
          />
          <Line
            type="monotone"
            dataKey="points"
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
