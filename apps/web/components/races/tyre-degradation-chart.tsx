'use client'

import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { TYRE_COLORS } from '@/lib/constants'
import type { CompoundDegradation, TyreDegradationResponse } from '@/lib/types'

interface TyreDegradationChartProps {
  data: TyreDegradationResponse
}

type Basis = 'corrected' | 'raw'

function compoundColor(compound: string): string {
  return TYRE_COLORS[compound] ?? TYRE_COLORS.UNKNOWN
}

function formatLapTime(ms: number): string {
  const minutes = Math.floor(ms / 60_000)
  const seconds = (ms % 60_000) / 1000
  return minutes > 0 ? `${minutes}:${seconds.toFixed(3).padStart(6, '0')}` : seconds.toFixed(3)
}

/** Degradation as the seconds-per-lap figure people actually quote. */
function formatDegradation(msPerLap: number | null): string {
  if (msPerLap === null) return '—'
  return `${msPerLap >= 0 ? '+' : ''}${(msPerLap / 1000).toFixed(3)}s/lap`
}

function CustomTooltip({
  active,
  payload,
  label,
  samples,
}: {
  active?: boolean
  payload?: Array<{ value: number; dataKey: string; color: string }>
  label?: number
  /** Lap counts behind each median, keyed by compound then tyre age. */
  samples?: Map<string, Map<number, number>>
}) {
  if (!active || !payload?.length) return null

  const entries = payload.filter((p) => p.value != null).sort((a, b) => a.value - b.value)
  if (entries.length === 0) return null

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
      <p className="text-muted-foreground mb-1 text-xs">Tyre age: {label} laps</p>
      {entries.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2">
          <span
            className="inline-block size-2.5 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-sm">{entry.dataKey}</span>
          <span className="text-muted-foreground ml-auto pl-3 text-sm tabular-nums">
            {formatLapTime(entry.value)}
          </span>
          {label !== undefined && (
            <span className="text-muted-foreground/70 text-xs tabular-nums">
              ({samples?.get(entry.dataKey)?.get(label) ?? 0} laps)
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

export function TyreDegradationChart({ data }: TyreDegradationChartProps) {
  const [basis, setBasis] = useState<Basis>('corrected')

  const compounds: CompoundDegradation[] = data.compounds

  const chartData = useMemo(() => {
    const byAge = new Map<number, Record<string, number>>()
    for (const compound of compounds) {
      for (const point of compound.points) {
        const row = byAge.get(point.tyreLife) ?? { tyreLife: point.tyreLife }
        row[compound.compound] =
          basis === 'corrected' ? point.fuelCorrectedMedianMs : point.medianMs
        byAge.set(point.tyreLife, row)
      }
    }
    return [...byAge.values()].sort((a, b) => a.tyreLife - b.tyreLife)
  }, [compounds, basis])

  // Sample counts, so a median drawn from two laps can be told from one drawn
  // from twenty.
  const samples = useMemo(() => {
    const map = new Map<string, Map<number, number>>()
    for (const compound of compounds) {
      map.set(
        compound.compound,
        new Map(compound.points.map((point) => [point.tyreLife, point.samples])),
      )
    }
    return map
  }, [compounds])

  if (compounds.length === 0) {
    return <p className="text-muted-foreground text-sm">No tyre data available for this race.</p>
  }

  const values = chartData.flatMap((row) =>
    compounds.map((c) => row[c.compound]).filter((v): v is number => typeof v === 'number'),
  )
  const min = Math.min(...values)
  const max = Math.max(...values)
  const padding = (max - min) * 0.1 || 500

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Legend doubles as the degradation readout. */}
        <div className="flex flex-wrap gap-2">
          {compounds.map((c) => (
            <span
              key={c.compound}
              className="border-border inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium"
            >
              <span
                className="inline-block size-2.5 rounded-full"
                style={{ backgroundColor: compoundColor(c.compound) }}
              />
              {c.compound}
              <span className="text-muted-foreground tabular-nums">
                {formatDegradation(
                  basis === 'corrected' ? c.degradationMsPerLap : c.rawTrendMsPerLap,
                )}
              </span>
            </span>
          ))}
        </div>

        <div className="border-border inline-flex rounded-lg border p-0.5 text-xs">
          {(
            [
              ['corrected', 'Fuel-corrected'],
              ['raw', 'As driven'],
            ] as const
          ).map(([value, labelText]) => (
            <button
              key={value}
              onClick={() => setBasis(value)}
              aria-pressed={basis === value}
              className={`rounded-md px-2.5 py-1 transition-colors ${
                basis === value
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {labelText}
            </button>
          ))}
        </div>
      </div>

      <div
        className="h-[24rem] w-full"
        role="img"
        aria-label="Lap time against tyre age, per compound"
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ left: 10, right: 20, top: 10, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 5%)" />
            <XAxis
              dataKey="tyreLife"
              type="number"
              tick={{ fontSize: 12, fill: 'oklch(0.5 0 0)' }}
              tickLine={{ stroke: 'oklch(0.3 0 0)' }}
              axisLine={{ stroke: 'oklch(0.3 0 0)' }}
              label={{
                value: 'Tyre age (laps)',
                position: 'insideBottom',
                offset: -10,
                fontSize: 12,
                fill: 'oklch(0.5 0 0)',
              }}
            />
            <YAxis
              type="number"
              domain={[min - padding, max + padding]}
              tick={{ fontSize: 11, fill: 'oklch(0.5 0 0)' }}
              tickLine={{ stroke: 'oklch(0.3 0 0)' }}
              axisLine={{ stroke: 'oklch(0.3 0 0)' }}
              tickFormatter={(v) => formatLapTime(v)}
              width={60}
              label={{
                value: 'Lap time',
                angle: -90,
                position: 'insideLeft',
                offset: 0,
                fontSize: 12,
                fill: 'oklch(0.5 0 0)',
              }}
            />
            <Tooltip
              content={<CustomTooltip samples={samples} />}
              cursor={{ stroke: 'oklch(1 0 0 / 15%)' }}
            />
            {compounds.map((c) => (
              <Line
                key={c.compound}
                type="monotone"
                dataKey={c.compound}
                stroke={compoundColor(c.compound)}
                strokeWidth={2}
                dot={false}
                connectNulls
                animationDuration={400}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="text-muted-foreground text-xs">
        {basis === 'corrected' ? (
          <>
            Lap times normalized to an end-of-race fuel load (
            {(data.fuelEffectMsPerLap / 1000).toFixed(3)}s per lap of fuel). Without this, burn-off
            masks tyre wear and soft-tyre stints appear to get faster with age.
          </>
        ) : (
          <>
            Lap times as driven. The car gets lighter through a stint, so these trends understate
            tyre degradation.
          </>
        )}{' '}
        Out-laps, in-laps and laps slower than {Math.round(data.cleanLapThreshold * 100)}% of the
        race median are excluded.
      </p>
    </div>
  )
}
