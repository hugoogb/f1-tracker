import type { BestSeasonComponent } from '@/lib/types'
import { cn } from '@/lib/utils'
import { NEUTRAL, SCORE_COLORS } from '@/lib/chart-theme'

export function componentColor(id: string): string {
  return SCORE_COLORS[id] ?? NEUTRAL
}

export function ScoreBreakdownBar({
  components,
  className,
}: {
  components: BestSeasonComponent[]
  className?: string
}) {
  const label = components.map((c) => `${c.label} ${c.points.toFixed(1)}/${c.weight}`).join(', ')
  return (
    <div
      className={cn('bg-surface-3 flex h-2 w-full gap-[2px] overflow-hidden', className)}
      role="img"
      aria-label={`Score breakdown: ${label}`}
    >
      {components
        .filter((c) => c.points > 0)
        .map((c) => (
          <span
            key={c.id}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{ width: `${c.points}%`, backgroundColor: componentColor(c.id) }}
            title={`${c.label}: ${c.points.toFixed(1)} of ${c.weight}`}
          />
        ))}
    </div>
  )
}

export function ScoreLegend({
  components,
  className,
}: {
  components: { id: string; label: string; weight: number }[]
  className?: string
}) {
  return (
    <ul className={cn('flex flex-wrap gap-x-4 gap-y-1 text-xs', className)}>
      {components.map((c) => (
        <li key={c.id} className="text-muted-foreground flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block size-2.5 rounded-sm"
            style={{ backgroundColor: componentColor(c.id) }}
          />
          {c.label} <span className="tabular-nums opacity-60">({c.weight})</span>
        </li>
      ))}
    </ul>
  )
}
