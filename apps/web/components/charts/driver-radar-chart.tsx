'use client'

import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import type { RadarStats } from '@/lib/types'

const STAT_LABELS: Record<keyof RadarStats, string> = {
  winRate: 'Win %',
  podiumRate: 'Podium %',
  poleRate: 'Pole %',
  pointsPerRace: 'Pts/Race',
  fastestLapRate: 'FL %',
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string; dataKey: string }>
}) {
  if (!active || !payload?.length) return null

  return (
    <div
      className="rounded-xl px-3 py-2"
      style={{
        backgroundColor: 'oklch(0.13 0.003 250 / 90%)',
        border: '1px solid oklch(1 0 0 / 10%)',
        color: 'oklch(0.95 0 0)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        backdropFilter: 'blur(12px)',
      }}
    >
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2">
          <span
            className="inline-block size-2.5 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-sm">{entry.name}</span>
          <span className="text-muted-foreground ml-auto pl-3 text-sm tabular-nums">
            {entry.value}
          </span>
        </div>
      ))}
    </div>
  )
}

interface DriverRadarChartProps {
  driver1Name: string
  driver2Name: string
  driver1Radar: RadarStats
  driver2Radar: RadarStats
  color1?: string
  color2?: string
}

export function DriverRadarChart({
  driver1Name,
  driver2Name,
  driver1Radar,
  driver2Radar,
  color1 = '#E8002D',
  color2 = '#3B82F6',
}: DriverRadarChartProps) {
  const data = Object.keys(STAT_LABELS).map((key) => ({
    stat: STAT_LABELS[key as keyof RadarStats],
    [driver1Name]: driver1Radar[key as keyof RadarStats],
    [driver2Name]: driver2Radar[key as keyof RadarStats],
  }))

  return (
    <div className="h-80 w-full" role="img" aria-label="Driver comparison radar chart">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
          <PolarGrid stroke="oklch(1 0 0 / 10%)" />
          <PolarAngleAxis dataKey="stat" tick={{ fontSize: 11, fill: 'oklch(0.6 0 0)' }} />
          <Radar
            name={driver1Name}
            dataKey={driver1Name}
            stroke={color1}
            fill={color1}
            fillOpacity={0.15}
            strokeWidth={2}
            style={{ filter: `drop-shadow(0 0 4px ${color1}80)` }}
          />
          <Radar
            name={driver2Name}
            dataKey={driver2Name}
            stroke={color2}
            fill={color2}
            fillOpacity={0.15}
            strokeWidth={2}
            style={{ filter: `drop-shadow(0 0 4px ${color2}80)` }}
          />
          <Tooltip content={<CustomTooltip />} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}
