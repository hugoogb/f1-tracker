import type { BestSeasonComponent } from '@/lib/types'
import { cn } from '@/lib/utils'

/**
 * One fixed colour per score component, in the API's component order.
 *
 * These describe parts of a score, not teams, so they are deliberately not
 * taken from the constructor palette. Validated as a categorical set against
 * the site's near-black surface (lightness band, chroma, colour-blind
 * separation of neighbours, contrast); the segments are also separated by a
 * gap and named in a legend, so colour never carries the identity alone.
 */
export const COMPONENT_COLORS: Record<string, string> = {
  closeness: '#3987e5',
  lateness: '#d95926',
  contention: '#199e70',
  variety: '#c98500',
  leadChanges: '#d55181',
}

export function componentColor(id: string): string {
  return COMPONENT_COLORS[id] ?? '#888888'
}

/**
 * The 0-100 score as a stacked bar: each segment is one component's points,
 * so the filled length is the total and the parts show where it came from.
 */
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
      className={cn('flex h-2 w-full gap-[2px] overflow-hidden rounded-full bg-white/5', className)}
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

/** The key for the bars above; the colours mean nothing without it. */
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
