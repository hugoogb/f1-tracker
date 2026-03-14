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
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 6%)" />
          <XAxis dataKey="year" tick={{ fontSize: 12, fill: 'oklch(0.6 0 0)' }} />
          <YAxis tick={{ fontSize: 12, fill: 'oklch(0.6 0 0)' }} width={50} />
          <Tooltip
            contentStyle={{
              backgroundColor: 'oklch(0.13 0.003 250 / 85%)',
              border: '1px solid oklch(1 0 0 / 10%)',
              borderRadius: '12px',
              color: 'oklch(0.95 0 0)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              backdropFilter: 'blur(12px)',
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
            style={{ filter: `drop-shadow(0 0 6px ${color})` }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
