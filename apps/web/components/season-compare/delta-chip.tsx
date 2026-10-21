import { cn } from '@/lib/utils'
import { signed, type SideInfo } from './sides'

export type Better = 'higher' | 'lower' | 'neutral'

/**
 * A signed A − B delta, tinted with the colour of whichever side it favours.
 *
 * The sign is always A minus B, as the API returns it; `better` says which way
 * is good for this stat, so a −1.5 average finish reads as A's advantage.
 */
export function DeltaChip({
  delta,
  better,
  sides,
  digits = 0,
  suffix = '',
  className,
}: {
  delta: number | null
  better: Better
  sides: [SideInfo, SideInfo]
  digits?: number
  suffix?: string
  className?: string
}) {
  if (delta === null) {
    return <span className={cn('text-muted-foreground text-xs', className)}>—</span>
  }
  const favoured =
    delta === 0 || better === 'neutral'
      ? null
      : (better === 'higher' ? delta > 0 : delta < 0)
        ? sides[0]
        : sides[1]

  return (
    <span
      className={cn(
        'font-data inline-flex h-5 items-center gap-1 border px-2 text-xs font-semibold whitespace-nowrap tabular-nums',
        !favoured && 'text-muted-foreground border-hairline-strong',
        className,
      )}
      style={
        favoured
          ? {
              color: favoured.color,
              // color-mix rather than a hex alpha suffix: the colour may be a CSS variable.
              borderColor: `color-mix(in oklch, ${favoured.color} 40%, transparent)`,
              backgroundColor: `color-mix(in oklch, ${favoured.color} 10%, transparent)`,
            }
          : undefined
      }
      title={favoured ? `In ${favoured.name}'s favour` : 'Level'}
    >
      {signed(delta, digits)}
      {suffix}
    </span>
  )
}
