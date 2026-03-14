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
        'inline-flex items-center justify-center rounded-md border font-mono font-semibold',
        sizeClasses,
        isNumeric && pos === 1 && 'pos-1',
        isNumeric && pos === 2 && 'pos-2',
        isNumeric && pos === 3 && 'pos-3',
        isNumeric && pos > 3 && 'border-border bg-muted/50 text-muted-foreground',
        !isNumeric && 'border-destructive/30 bg-destructive/10 text-destructive',
        className,
      )}
    >
      {label}
    </span>
  )
}
