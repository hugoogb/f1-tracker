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

interface Side {
  name: string
  short: string
  color: string
}

interface GapPoint {
  round: number
  raceName: string
  session: string
  deltaMs: number
  deltaPct: number
}

/**
 * One bar per round: the A − B qualifying gap in percent, in the colour of the
 * quicker side. A bar below zero is A on top. Rounds with no comparable times
 * are simply absent, and the caption says how many that leaves.
 */
export function QualifyingGapChart({
  gaps,
  sideA,
  sideB,
}: {
  gaps: GapPoint[]
  sideA: Side
  sideB: Side
}) {
  if (gaps.length === 0) return null

  return (
    <div className="h-64 w-full" role="img" aria-label="Qualifying gap per round">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={gaps} margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 6%)" vertical={false} />
          <XAxis dataKey="round" tick={{ fontSize: 12, fill: 'oklch(0.6 0 0)' }} />
          <YAxis
            tick={{ fontSize: 12, fill: 'oklch(0.6 0 0)' }}
            width={56}
            tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v.toFixed(2)}%`}
          />
          <Tooltip
            cursor={{ fill: 'oklch(1 0 0 / 4%)' }}
            contentStyle={{
              backgroundColor: 'oklch(0.13 0.003 250 / 85%)',
              border: '1px solid oklch(1 0 0 / 10%)',
              borderRadius: '12px',
              color: 'oklch(0.95 0 0)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              padding: '8px 12px',
            }}
            labelFormatter={(label, payload) => {
              const gap = payload?.[0]?.payload as GapPoint | undefined
              return `R${label}${gap ? ` — ${gap.raceName} (${gap.session})` : ''}`
            }}
            formatter={(_value, _name, item) => {
              const gap = item.payload as GapPoint
              if (gap.deltaMs === 0) return ['Identical times', 'Gap']
              const quicker = gap.deltaMs < 0 ? sideA : sideB
              return [
                `${quicker.short} by ${(Math.abs(gap.deltaMs) / 1000).toFixed(3)}s (${Math.abs(gap.deltaPct).toFixed(3)}%)`,
                'Quicker',
              ]
            }}
          />
          <ReferenceLine y={0} stroke="oklch(0.85 0 0 / 60%)" strokeWidth={1.5} />
          <Bar dataKey="deltaPct" radius={[3, 3, 3, 3]} maxBarSize={28}>
            {gaps.map((g) => (
              <Cell
                key={g.round}
                fill={g.deltaMs < 0 ? sideA.color : g.deltaMs > 0 ? sideB.color : 'oklch(0.6 0 0)'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
