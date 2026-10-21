import { filledSegments } from '@/lib/meter'
import { liveryStyle } from '@/lib/livery'
import { cn } from '@/lib/utils'

/** A segmented telemetry meter for rates and progress. */
export function Meter({
  value,
  max,
  segments = 10,
  accent,
  label,
  className,
}: {
  value: number
  max: number
  segments?: number
  accent?: string | null
  /** Accessible name, e.g. "Win rate". */
  label: string
  className?: string
}) {
  const filled = filledSegments(value, max, segments)
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      style={liveryStyle(accent)}
      className={cn('flex h-1.5 gap-0.5', className)}
    >
      {Array.from({ length: segments }, (_, i) => (
        <span
          key={i}
          className={cn('flex-1 -skew-x-[20deg]', i < filled ? 'bg-accent-livery' : 'bg-surface-3')}
        />
      ))}
    </div>
  )
}
