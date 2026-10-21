'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  NEUTRAL,
  REFERENCE,
  axisProps,
  barCursor,
  gridProps,
  tooltipContentStyle,
  tooltipLabelStyle,
} from '@/lib/chart-theme'

interface Side {
  name: string
  short: string
  color: string
}

interface RoundPoint {
  round: number
  raceName: string
  a: number
  b: number
  delta: number
}

function fmt(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

/**
 * Both sides' cumulative official points, with the gap between them beneath.
 *
 * The gap is drawn as one bar per round above or below a zero line, each bar in
 * the colour of whoever was ahead after that round, so the rounds where the
 * lead changed hands are exactly where the bars flip sides. The two charts
 * share a `syncId`, so hovering one round highlights it in both.
 */
export function SeasonPointsDeltaChart({
  rounds,
  sideA,
  sideB,
}: {
  rounds: RoundPoint[]
  sideA: Side
  sideB: Side
}) {
  if (rounds.length === 0) return null

  return (
    <div className="space-y-2">
      <div className="h-72 w-full" role="img" aria-label="Cumulative points, round by round">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={rounds}
            syncId="season-compare"
            margin={{ left: 0, right: 20, top: 5, bottom: 5 }}
          >
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="round" {...axisProps} />
            <YAxis {...axisProps} width={50} />
            <Tooltip
              contentStyle={tooltipContentStyle}
              labelStyle={tooltipLabelStyle}
              labelFormatter={(label, payload) => {
                const race = payload?.[0]?.payload as RoundPoint | undefined
                return `R${label}${race ? ` — ${race.raceName}` : ''}`
              }}
              formatter={(value) => `${fmt(Number(value))} pts`}
            />
            <Legend wrapperStyle={{ fontSize: '13px', paddingTop: '8px' }} />
            <Line
              type="monotone"
              dataKey="a"
              name={sideA.name}
              stroke={sideA.color}
              strokeWidth={2.5}
              dot={{ r: 2.5, strokeWidth: 0, fill: sideA.color }}
              activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--background)' }}
            />
            <Line
              type="monotone"
              dataKey="b"
              name={sideB.name}
              stroke={sideB.color}
              strokeWidth={2.5}
              dot={{ r: 2.5, strokeWidth: 0, fill: sideB.color }}
              activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--background)' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div
        className="h-40 w-full"
        role="img"
        aria-label="Points gap between the two, round by round"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rounds}
            syncId="season-compare"
            margin={{ left: 0, right: 20, top: 5, bottom: 5 }}
          >
            <CartesianGrid {...gridProps} vertical={false} />
            <XAxis dataKey="round" {...axisProps} />
            <YAxis
              {...axisProps}
              width={50}
              tickFormatter={(v: number) => (v > 0 ? `+${v}` : `${v}`)}
            />
            <Tooltip
              cursor={barCursor}
              contentStyle={tooltipContentStyle}
              labelStyle={tooltipLabelStyle}
              labelFormatter={(label) => `After round ${label}`}
              formatter={(value) => {
                const delta = Number(value)
                if (delta === 0) return ['Level', 'Gap']
                const leader = delta > 0 ? sideA : sideB
                return [`${leader.short} +${fmt(Math.abs(delta))} pts`, 'Gap']
              }}
            />
            <ReferenceLine
              y={0}
              stroke={REFERENCE}
              strokeWidth={1.5}
              label={{
                value: 'level',
                position: 'insideLeft',
                fontSize: 10,
                fill: NEUTRAL,
              }}
            />
            <Bar dataKey="delta" name="Gap" radius={[3, 3, 3, 3]} maxBarSize={28}>
              {rounds.map((r) => (
                <Cell
                  key={r.round}
                  fill={r.delta > 0 ? sideA.color : r.delta < 0 ? sideB.color : NEUTRAL}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-muted-foreground flex flex-wrap justify-center gap-x-4 text-xs">
        <span>
          Above the line: <span style={{ color: sideA.color }}>{sideA.short} ahead</span>
        </span>
        <span>
          Below the line: <span style={{ color: sideB.color }}>{sideB.short} ahead</span>
        </span>
      </p>
    </div>
  )
}
