import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Panel } from '@/components/ui/panel'
import { AnimatedNumber } from '@/components/ui/motion'

interface StatCardProps {
  label: string
  value: number | string
  icon?: LucideIcon
  href?: string
  /** A team colour: tints the brackets and the edge strip. */
  color?: string
  description?: string
  className?: string
}

/** A telemetry readout: label, one big display-type number, a footnote. */
export function StatCard({
  label,
  value,
  icon: Icon,
  href,
  color,
  description,
  className,
}: StatCardProps) {
  const card = (
    <Panel
      size="sm"
      accent={color}
      className={cn(
        'gap-1 px-4 py-4',
        color && 'shadow-[inset_3px_0_0_var(--accent-livery)]',
        href && 'hover:bg-surface-2 transition-colors',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="label">{label}</p>
        {Icon && <Icon className="text-label size-4" aria-hidden />}
      </div>
      {typeof value === 'number' ? (
        <AnimatedNumber value={value} className="display text-4xl tabular-nums" />
      ) : (
        <p className="display text-4xl tabular-nums">{value}</p>
      )}
      {description && <p className="text-muted-foreground text-xs">{description}</p>}
    </Panel>
  )

  if (href) {
    return (
      <Link href={href} className="focus-ring block">
        {card}
      </Link>
    )
  }

  return card
}
