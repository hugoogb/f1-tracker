'use client'

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

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
        <LineChart data={data} margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
          <XAxis dataKey="year" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
          <YAxis tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} width={50} />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--popover))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '6px',
              color: 'hsl(var(--foreground))',
            }}
            formatter={(value) => [String(value), 'Points']}
            labelFormatter={(label) => `${label} Season`}
          />
          <Line
            type="monotone"
            dataKey="points"
            stroke={color}
            strokeWidth={2}
            dot={{ r: 3, fill: color }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
