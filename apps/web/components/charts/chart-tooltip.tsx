'use client'

import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * The shared tooltip chrome: a small bracketed readout panel. Charts with
 * their own tooltip content wrap it in this; charts without use
 * `ChartTooltip`, which renders the label and one row per series.
 */
export function TooltipFrame({
  title,
  children,
  className,
}: {
  title?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('chart-tooltip min-w-36', className)}>
      {title !== undefined && title !== null && <div className="label mb-1.5">{title}</div>}
      <div className="space-y-1">{children}</div>
    </div>
  )
}

/** One coloured row of a tooltip. */
export function TooltipRow({
  color,
  name,
  value,
}: {
  color?: string
  name: ReactNode
  value: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground flex items-center gap-1.5">
        {color && <span className="size-2 shrink-0" style={{ backgroundColor: color }} />}
        {name}
      </span>
      <span className="text-foreground font-semibold">{value}</span>
    </div>
  )
}

interface TooltipPayloadEntry {
  name?: string | number
  value?: unknown
  color?: string
  dataKey?: string | number | ((entry: unknown) => unknown)
  payload?: unknown
}

interface ChartTooltipProps {
  active?: boolean
  payload?: readonly TooltipPayloadEntry[]
  label?: unknown
  formatLabel?: (label: unknown) => ReactNode
  formatValue?: (value: number, name: string) => ReactNode
}

/** Generic tooltip content: `<Tooltip content={<ChartTooltip />} />`. */
export function ChartTooltip({
  active,
  payload,
  label,
  formatLabel,
  formatValue,
}: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <TooltipFrame title={formatLabel ? formatLabel(label) : String(label ?? '')}>
      {payload.map((entry, i) => {
        const name = String(entry.name ?? entry.dataKey ?? '')
        const raw = entry.value
        const value =
          typeof raw === 'number' && formatValue ? formatValue(raw, name) : String(raw ?? '–')
        return <TooltipRow key={`${name}-${i}`} color={entry.color} name={name} value={value} />
      })}
    </TooltipFrame>
  )
}
