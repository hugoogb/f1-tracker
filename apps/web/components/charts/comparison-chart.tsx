'use client'

import {
  CartesianGrid,
  Line,
  LineChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

interface ComparisonChartProps {
  driver1Name: string
  driver2Name: string
  driver1Seasons: { year: number; points: number }[]
  driver2Seasons: { year: number; points: number }[]
  color1?: string
  color2?: string
}

export function ComparisonChart({
  driver1Name,
  driver2Name,
  driver1Seasons,
  driver2Seasons,
  color1 = '#E8002D',
  color2 = '#3671C6',
}: ComparisonChartProps) {
  // Merge both drivers' data by year
  const yearSet = new Set([
    ...driver1Seasons.map((s) => s.year),
    ...driver2Seasons.map((s) => s.year),
  ])
  const years = Array.from(yearSet).sort((a, b) => a - b)

  const d1Map = new Map(driver1Seasons.map((s) => [s.year, s.points]))
  const d2Map = new Map(driver2Seasons.map((s) => [s.year, s.points]))

  const data = years.map((year) => ({
    year,
    [driver1Name]: d1Map.get(year) ?? null,
    [driver2Name]: d2Map.get(year) ?? null,
  }))

  if (data.length === 0) return null

  return (
    <div className="h-72 w-full" role="img" aria-label="Driver comparison points chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
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
            labelFormatter={(label) => `${label} Season`}
          />
          <Legend wrapperStyle={{ fontSize: '13px', paddingTop: '8px' }} />
          <Line
            type="monotone"
            dataKey={driver1Name}
            stroke={color1}
            strokeWidth={2.5}
            dot={{ r: 3, strokeWidth: 0 }}
            activeDot={{ r: 6, strokeWidth: 2, stroke: 'var(--background)' }}
            connectNulls
            style={{ filter: `drop-shadow(0 0 6px ${color1})` }}
          />
          <Line
            type="monotone"
            dataKey={driver2Name}
            stroke={color2}
            strokeWidth={2.5}
            dot={{ r: 3, strokeWidth: 0 }}
            activeDot={{ r: 6, strokeWidth: 2, stroke: 'var(--background)' }}
            connectNulls
            style={{ filter: `drop-shadow(0 0 6px ${color2})` }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
