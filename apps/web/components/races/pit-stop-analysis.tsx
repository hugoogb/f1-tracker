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
import { Card, CardContent } from '@/components/ui/card'
import type { PitStopAnalysis } from '@/lib/types'

function TeamTooltip({
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
    <div
      className="rounded-xl px-3 py-2"
      style={{
        backgroundColor: 'oklch(0.13 0.003 250 / 85%)',
        border: '1px solid oklch(1 0 0 / 10%)',
        color: 'oklch(0.95 0 0)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-block size-2.5 rounded-full"
          style={{ backgroundColor: item.color }}
        />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <p className="text-muted-foreground mt-0.5 text-sm tabular-nums">{value}s avg</p>
    </div>
  )
}

function DistributionTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
}) {
  if (!active || !payload?.length) return null

  return (
    <div
      className="rounded-xl px-3 py-2"
      style={{
        backgroundColor: 'oklch(0.13 0.003 250 / 85%)',
        border: '1px solid oklch(1 0 0 / 10%)',
        color: 'oklch(0.95 0 0)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <p className="text-sm font-medium">{label}</p>
      <p className="text-muted-foreground mt-0.5 text-sm tabular-nums">{payload[0].value} stops</p>
    </div>
  )
}

interface PitStopAnalysisProps {
  analysis: PitStopAnalysis
}

export function PitStopAnalysisView({ analysis }: PitStopAnalysisProps) {
  if (analysis.totalStops === 0) return null

  const teamData = analysis.teamAverages.map((t) => ({
    name: t.constructor.name,
    avgDuration: parseFloat(t.avgDuration),
    color: t.constructor.color ?? '#888888',
    stopCount: t.stopCount,
  }))

  const barHeight = 28
  const teamChartHeight = Math.max(160, teamData.length * barHeight + 40)

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {/* Fastest Stop */}
        {analysis.fastestStop && (
          <Card className="col-span-2 border border-green-500/30 bg-green-500/5 sm:col-span-1">
            <CardContent className="px-4 py-3">
              <p className="text-xs font-medium tracking-wider text-green-400 uppercase">
                Fastest Stop
              </p>
              <p className="font-mono text-lg font-bold text-green-300">
                {analysis.fastestStop.duration}s
              </p>
              <p className="text-muted-foreground text-sm">
                {analysis.fastestStop.driver.firstName} {analysis.fastestStop.driver.lastName}
              </p>
              <p className="text-muted-foreground text-xs">
                Lap {analysis.fastestStop.lap} · Stop {analysis.fastestStop.stopNumber}
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="px-4 py-3">
            <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
              Total Stops
            </p>
            <p className="font-heading text-lg font-bold">{analysis.totalStops}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="px-4 py-3">
            <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
              Avg Duration
            </p>
            <p className="font-heading text-lg font-bold">
              {analysis.avgDuration ? `${analysis.avgDuration}s` : '—'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Team Averages */}
      {teamData.length > 0 && (
        <div>
          <h4 className="mb-3 text-sm font-medium">Average Pit Stop Duration by Team</h4>
          <div style={{ height: teamChartHeight }} role="img" aria-label="Team pit stop averages">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={teamData}
                layout="vertical"
                margin={{ left: 0, right: 20, top: 5, bottom: 5 }}
              >
                <CartesianGrid
                  horizontal={false}
                  strokeDasharray="3 3"
                  stroke="oklch(1 0 0 / 6%)"
                />
                <XAxis
                  type="number"
                  tick={{ fontSize: 12, fill: 'oklch(0.6 0 0)' }}
                  tickFormatter={(v) => `${v}s`}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={100}
                  tick={{ fontSize: 12, fill: 'oklch(0.6 0 0)' }}
                />
                <Tooltip
                  content={<TeamTooltip />}
                  cursor={{ fill: 'var(--muted)', opacity: 0.3 }}
                />
                <Bar dataKey="avgDuration" radius={[0, 4, 4, 0]} animationDuration={600}>
                  {teamData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} fillOpacity={0.9} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Distribution */}
      {analysis.distribution.length > 0 && (
        <div>
          <h4 className="mb-3 text-sm font-medium">Pit Stop Duration Distribution</h4>
          <div className="h-48" role="img" aria-label="Pit stop duration distribution">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={analysis.distribution}
                margin={{ left: 0, right: 20, top: 5, bottom: 5 }}
              >
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="oklch(1 0 0 / 6%)" />
                <XAxis dataKey="range" tick={{ fontSize: 12, fill: 'oklch(0.6 0 0)' }} />
                <YAxis tick={{ fontSize: 12, fill: 'oklch(0.6 0 0)' }} />
                <Tooltip
                  content={<DistributionTooltip />}
                  cursor={{ fill: 'var(--muted)', opacity: 0.3 }}
                />
                <Bar
                  dataKey="count"
                  fill="oklch(0.65 0.15 250)"
                  radius={[4, 4, 0, 0]}
                  animationDuration={600}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}
