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
    <div
      className="max-w-xs rounded-xl px-3 py-2 text-xs"
      style={{
        backgroundColor: 'oklch(0.13 0.003 250 / 85%)',
        border: '1px solid oklch(1 0 0 / 10%)',
        color: 'oklch(0.95 0 0)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <p className="flex items-baseline justify-between gap-4">
        <span className="font-heading text-sm font-bold">{point.year}</span>
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
                fill={i % 2 === 0 ? 'oklch(1 0 0 / 4%)' : 'oklch(1 0 0 / 0%)'}
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
                        fill: 'oklch(0.55 0 0)',
                      }
                    : undefined
                }
              />
            ))}
          <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 6%)" vertical={false} />
          <XAxis
            dataKey="year"
            type="number"
            domain={[first - 0.5, last + 0.5]}
            tickCount={10}
            allowDecimals={false}
            tick={{ fontSize: 12, fill: 'oklch(0.6 0 0)' }}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tick={{ fontSize: 12, fill: 'oklch(0.6 0 0)' }}
            width={36}
          />
          <Tooltip
            content={<ChartTooltip />}
            cursor={{ stroke: 'oklch(1 0 0 / 15%)', strokeWidth: 1 }}
          />
          <Line
            type="monotone"
            dataKey="score"
            name="Score"
            stroke="oklch(0.7 0 0 / 45%)"
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
