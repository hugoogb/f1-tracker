'use client'

import type { CSSProperties } from 'react'
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
import { axisProps, gridProps } from '@/lib/chart-theme'
import { teamColorOf } from '@/lib/utils'
import type { ConstructorStanding, DriverStanding } from '@/lib/types'

interface PointsBar {
  name: string
  points: number
  color: string
}

function CustomTooltip({
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
    <div className="chart-tooltip">
      <div className="flex items-center gap-2">
        <span
          className="inline-block size-2.5 rounded-full"
          style={{ backgroundColor: item.color }}
        />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <p className="text-muted-foreground mt-0.5 text-sm tabular-nums">{value} pts</p>
    </div>
  )
}

/** One bar per entry, longest first, in its team colour. */
function HorizontalPointsBar({
  data,
  labelWidth,
  className,
  style,
  ariaLabel,
}: {
  data: PointsBar[]
  labelWidth: number
  className: string
  style?: CSSProperties
  ariaLabel: string
}) {
  if (data.length === 0) return null

  return (
    <div className={className} style={style} role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
          <CartesianGrid {...gridProps} horizontal={false} />
          <XAxis type="number" {...axisProps} />
          <YAxis type="category" dataKey="name" width={labelWidth} {...axisProps} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--muted)', opacity: 0.3 }} />
          <Bar dataKey="points" radius={[0, 4, 4, 0]} animationDuration={600}>
            {data.map((entry, index) => (
              <Cell key={index} fill={entry.color} fillOpacity={0.9} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** The top ten of the drivers' table. */
export function PointsBarChart({ standings }: { standings: DriverStanding[] }) {
  return (
    <HorizontalPointsBar
      data={standings.slice(0, 10).map((s) => ({
        name: s.driver.lastName,
        points: s.points,
        color: teamColorOf(s.constructor?.color),
      }))}
      labelWidth={85}
      className="mb-6 h-72 w-full"
      ariaLabel="Driver points bar chart"
    />
  )
}

const CONSTRUCTOR_BAR_HEIGHT = 28

/** Every constructor in the table, the chart growing with the field. */
export function ConstructorPointsChart({ standings }: { standings: ConstructorStanding[] }) {
  return (
    <HorizontalPointsBar
      data={standings.map((s) => ({
        name: s.constructor.name,
        points: s.points,
        color: teamColorOf(s.constructor.color),
      }))}
      labelWidth={100}
      className="mb-6 w-full"
      style={{ height: Math.max(200, standings.length * CONSTRUCTOR_BAR_HEIGHT + 40) }}
      ariaLabel="Constructor points bar chart"
    />
  )
}
