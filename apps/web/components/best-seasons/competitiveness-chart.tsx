'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { BAND, NEUTRAL, REFERENCE, axisProps, gridProps, lineCursor } from '@/lib/chart-theme'
import type { BestSeason } from '@/lib/types'
import { teamColorOf } from '@/lib/utils'
import { deciderLabel, formatPoints } from './format'

interface Point {
  year: number
  score: number
  champion: string | null
  rival: string | null
  color: string
  margin: number | null
  decider: string
}

/** A band narrower than this keeps its shading but drops its label. */
const LABEL_MIN_PX = 72

export interface ChartEra {
  id: string
  /** "1961-1990 · 9-6-4-3-2-1", for the filter. */
  label: string
  /** "1961-1990", for the band on the chart. */
  short: string
  from: number
  to: number
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload?: Point }>
}) {
  const point = payload?.[0]?.payload
  if (!active || !point) return null
  return (
    <div className="chart-tooltip max-w-xs text-xs">
      <p className="flex items-baseline justify-between gap-4">
        <span className="display text-base">{point.year}</span>
        <span className="tabular-nums">{point.score.toFixed(1)} / 100</span>
      </p>
      {point.champion && (
        <p className="mt-1 flex items-center gap-1.5">
          <span
            className="inline-block size-2 rounded-full"
            style={{ backgroundColor: point.color }}
          />
          {point.champion}
          {point.rival && <span className="opacity-60"> vs {point.rival}</span>}
        </p>
      )}
      <p className="mt-0.5 opacity-70">
        Margin {formatPoints(point.margin)} pts · decided {point.decider.toLowerCase()}
      </p>
      <p className="mt-1 opacity-50">Click to open the season</p>
    </div>
  )
}

/**
 * Competitiveness score for every completed season, with the points-system eras
 * shaded behind it. One series, so no legend: the dots wear the champion's team
 * colour, which the tooltip names, and a click opens that season.
 */
export function CompetitivenessChart({
  seasons,
  eras,
}: {
  seasons: BestSeason[]
  eras: ChartEra[]
}) {
  const router = useRouter()
  // Plot width, so an era band is labelled only when its label fits inside it.
  const [width, setWidth] = useState(0)
  const data: Point[] = [...seasons]
    .sort((a, b) => a.year - b.year)
    .map((s) => ({
      year: s.year,
      score: s.score.total,
      champion: s.champion ? s.champion.driver.lastName : null,
      rival: s.runnerUp ? s.runnerUp.driver.lastName : null,
      color: teamColorOf(s.champion?.constructor?.color)!,
      margin: s.titleMargin,
      decider: deciderLabel(s),
    }))

  if (data.length === 0) return null
  const first = data[0].year
  const last = data[data.length - 1].year

  return (
    <div
      className="h-80 w-full"
      role="img"
      aria-label="Competitiveness score by season, from 1950 to the latest completed season"
    >
      <ResponsiveContainer width="100%" height="100%" onResize={(w) => setWidth(w)}>
        <LineChart
          data={data}
          margin={{ left: 0, right: 16, top: 24, bottom: 5 }}
          onClick={(state) => {
            const year = Number(state?.activeLabel)
            if (Number.isFinite(year)) router.push(`/seasons/${year}`)
          }}
          style={{ cursor: 'pointer' }}
        >
          {eras
            .filter((era) => era.to >= first && era.from <= last)
            .map((era, i) => (
              <ReferenceArea
                key={era.id}
                x1={Math.max(era.from, first) - 0.5}
                x2={Math.min(era.to, last) + 0.5}
                fill={i % 2 === 0 ? BAND : 'transparent'}
                strokeOpacity={0}
                ifOverflow="hidden"
                label={
                  ((Math.min(era.to, last) - Math.max(era.from, first) + 1) * (width - 52)) /
                    (last - first + 1) >=
                  LABEL_MIN_PX
                    ? {
                        value: era.short,
                        position: 'insideTop',
                        offset: -18,
                        fontSize: 10,
                        fill: NEUTRAL,
                      }
                    : undefined
                }
              />
            ))}
          <CartesianGrid {...gridProps} vertical={false} />
          <XAxis
            dataKey="year"
            type="number"
            domain={[first - 0.5, last + 0.5]}
            tickCount={10}
            allowDecimals={false}
            {...axisProps}
          />
          <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} {...axisProps} width={36} />
          <Tooltip content={<ChartTooltip />} cursor={lineCursor} />
          <Line
            type="monotone"
            dataKey="score"
            name="Score"
            stroke={REFERENCE}
            strokeWidth={2}
            isAnimationActive={false}
            dot={(props: { cx?: number; cy?: number; payload?: Point; index?: number }) => (
              <circle
                key={props.index}
                cx={props.cx}
                cy={props.cy}
                r={4}
                fill={props.payload?.color}
                stroke="var(--background)"
                strokeWidth={2}
              />
            )}
            activeDot={{ r: 7, strokeWidth: 2, stroke: 'var(--background)' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
