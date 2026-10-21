'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { REFERENCE, SERIES, axisProps, gridProps } from '@/lib/chart-theme'
import { Panel, PanelContent } from '@/components/ui/panel'
import { teamColorOf } from '@/lib/utils'
import type { PitStopAnalysis } from '@/lib/types'

interface TeamRow {
  name: string
  avgDuration: number
  bestDuration: number
  avgTimeLost: number
  color: string
  stopCount: number
}

function TeamTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: TeamRow }>
}) {
  if (!active || !payload?.length) return null
  const team = payload[0].payload

  return (
    <div className="chart-tooltip">
      <div className="flex items-center gap-2">
        <span
          className="inline-block size-2.5 rounded-full"
          style={{ backgroundColor: team.color }}
        />
        <span className="text-sm font-medium">{team.name}</span>
      </div>
      <dl className="mt-1 space-y-0.5 text-xs">
        <div className="flex justify-between gap-6">
          <dt className="text-muted-foreground">Avg off the best</dt>
          <dd className="tabular-nums">+{team.avgTimeLost.toFixed(3)}s</dd>
        </div>
        <div className="flex justify-between gap-6">
          <dt className="text-muted-foreground">Avg pit lane</dt>
          <dd className="tabular-nums">{team.avgDuration.toFixed(3)}s</dd>
        </div>
        <div className="flex justify-between gap-6">
          <dt className="text-muted-foreground">Best pit lane</dt>
          <dd className="tabular-nums">{team.bestDuration.toFixed(3)}s</dd>
        </div>
        <div className="flex justify-between gap-6">
          <dt className="text-muted-foreground">Stops</dt>
          <dd className="tabular-nums">{team.stopCount}</dd>
        </div>
      </dl>
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
    <div className="chart-tooltip">
      <p className="text-sm font-medium">{label} off the best</p>
      <p className="text-muted-foreground mt-0.5 text-sm tabular-nums">
        {payload[0].value} {payload[0].value === 1 ? 'stop' : 'stops'}
      </p>
    </div>
  )
}

function Stat({
  label,
  value,
  hint,
  className,
}: {
  label: string
  value: string
  hint?: string
  className?: string
}) {
  return (
    <Panel className={className}>
      <PanelContent className="px-4 py-3">
        <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
          {label}
        </p>
        <p className="display text-lg tabular-nums">{value}</p>
        {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
      </PanelContent>
    </Panel>
  )
}

interface PitStopAnalysisProps {
  analysis: PitStopAnalysis
}

export function PitStopAnalysisView({ analysis }: PitStopAnalysisProps) {
  if (analysis.totalStops === 0 || !analysis.benchmark) return null

  const teamData: TeamRow[] = analysis.teamAverages.map((t) => ({
    name: t.constructor.name,
    avgDuration: parseFloat(t.avgDuration),
    bestDuration: parseFloat(t.bestDuration),
    avgTimeLost: parseFloat(t.avgTimeLost),
    color: teamColorOf(t.constructor.color)!,
    stopCount: t.stopCount,
  }))

  const barHeight = 28
  const teamChartHeight = Math.max(160, teamData.length * barHeight + 40)
  const anyStops = analysis.distribution.some((bucket) => bucket.count > 0)

  return (
    <div className="space-y-6">
      {/* What the numbers mean. Without this the headline figure reads as a
          three-second stop that took twenty seconds. */}
      <p className="text-muted-foreground text-sm leading-relaxed">
        A stop is timed across the <strong className="text-foreground">pit lane</strong> — entry
        line to exit line, with the stationary time included. How long that takes is mostly down to
        the pit lane itself, which runs from about 13s at Melbourne to 24s at Bahrain, so the
        figures below are also given as{' '}
        <strong className="text-foreground">
          time lost against the quickest stop of this race
        </strong>
        . Every crew drives the same pit lane, so what is left over is the part they control.
      </p>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {analysis.fastestStop && (
          <Panel className="border-positive/30 bg-positive/5 col-span-2 sm:col-span-1">
            <PanelContent className="px-4 py-3">
              <p className="text-positive text-xs font-medium tracking-wider uppercase">
                Quickest Stop
              </p>
              <p className="font-data text-positive text-lg font-bold tabular-nums">
                {analysis.fastestStop.duration}s
              </p>
              <p className="text-muted-foreground text-sm">
                {analysis.fastestStop.driver.firstName} {analysis.fastestStop.driver.lastName}
              </p>
              <p className="text-muted-foreground text-xs">
                Lap {analysis.fastestStop.lap} · Stop {analysis.fastestStop.stopNumber}
              </p>
            </PanelContent>
          </Panel>
        )}

        <Stat label="Total Stops" value={String(analysis.totalStops)} />
        {analysis.medianDuration && (
          <Stat
            label="Median Pit Lane"
            value={`${analysis.medianDuration}s`}
            hint="Half the field was quicker"
          />
        )}
        {analysis.avgTimeLost && (
          <Stat
            label="Avg Time Lost"
            value={`+${analysis.avgTimeLost}s`}
            hint="Against the quickest stop"
          />
        )}
      </div>

      {teamData.length > 0 && (
        <div>
          <h4 className="text-sm font-medium">Time lost by team</h4>
          <p className="text-muted-foreground mb-3 text-xs">
            Average seconds off the race&apos;s quickest pit lane time of {analysis.benchmark}s.
            Shorter is better.
          </p>
          <div style={{ height: teamChartHeight }} role="img" aria-label="Time lost by team">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={teamData}
                layout="vertical"
                margin={{ left: 0, right: 24, top: 5, bottom: 5 }}
              >
                <CartesianGrid {...gridProps} horizontal={false} />
                <XAxis type="number" {...axisProps} tickFormatter={(v) => `+${v}s`} />
                <YAxis type="category" dataKey="name" width={100} {...axisProps} />
                <Tooltip
                  content={<TeamTooltip />}
                  cursor={{ fill: 'var(--muted)', opacity: 0.3 }}
                />
                <Bar dataKey="avgTimeLost" radius={[0, 4, 4, 0]} animationDuration={600}>
                  {teamData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} fillOpacity={0.9} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {anyStops && (
        <div>
          <h4 className="text-sm font-medium">How much time each stop cost</h4>
          <p className="text-muted-foreground mb-3 text-xs">
            Stops grouped by how far off the race&apos;s quickest they were. A long tail on the
            right means botched stops or a busy pit lane.
          </p>
          <div className="h-48" role="img" aria-label="Distribution of time lost per stop">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={analysis.distribution}
                margin={{ left: 0, right: 20, top: 5, bottom: 5 }}
              >
                <CartesianGrid {...gridProps} vertical={false} />
                <XAxis dataKey="range" {...axisProps} interval={0} />
                <YAxis allowDecimals={false} {...axisProps} />
                <ReferenceLine y={0} stroke={REFERENCE} />
                <Tooltip
                  content={<DistributionTooltip />}
                  cursor={{ fill: 'var(--muted)', opacity: 0.3 }}
                />
                <Bar
                  dataKey="count"
                  fill={SERIES[1]}
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
