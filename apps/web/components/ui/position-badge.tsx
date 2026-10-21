import { cn } from '@/lib/utils'

interface PositionBadgeProps {
  position: number | string
  size?: 'sm' | 'md'
  className?: string
}

export function PositionBadge({ position, size = 'md', className }: PositionBadgeProps) {
  const pos = typeof position === 'string' ? parseInt(position, 10) : position
  const isNumeric = !isNaN(pos)
  const label = isNumeric ? `P${pos}` : String(position)

  const sizeClasses = size === 'sm' ? 'h-5 min-w-5 px-1 text-xs' : 'h-6 min-w-6 px-1.5 text-xs'

  return (
    <span
      className={cn(
        'font-data inline-flex items-center justify-center rounded-sm border font-semibold tabular-nums',
        sizeClasses,
        isNumeric && pos === 1 && 'border-gold/40 bg-gold/15 text-gold',
        isNumeric && pos === 2 && 'border-silver/40 bg-silver/15 text-silver',
        isNumeric && pos === 3 && 'border-bronze/40 bg-bronze/15 text-bronze',
        isNumeric && pos > 3 && 'border-hairline bg-surface-2 text-muted-foreground',
        !isNumeric && 'border-destructive/30 bg-destructive/10 text-destructive',
        className,
      )}
    >
      {label}
    </span>
  )
}
