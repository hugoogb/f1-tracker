import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { AnimatedNumber, MotionCard } from '@/components/ui/motion'

interface StatCardProps {
  label: string
  value: number | string
  icon?: LucideIcon
  href?: string
  color?: string
  description?: string
  className?: string
}

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
    <Card
      className={cn(
        'glow-border relative gap-4 py-5 transition-all duration-200',
        href && 'hover:border-primary/30 card-glow cursor-pointer',
        className,
      )}
    >
      {color && (
        <div
          className="absolute top-0 left-0 h-full w-1 rounded-l-2xl"
          style={{ backgroundColor: color }}
        />
      )}
      <div className="flex items-start justify-between px-5">
        <div className="space-y-1">
          <p className="text-muted-foreground text-sm font-medium">{label}</p>
          {typeof value === 'number' ? (
            <AnimatedNumber
              value={value}
              className="font-heading text-3xl font-bold tracking-tight tabular-nums"
            />
          ) : (
            <p className="font-heading text-3xl font-bold tracking-tight tabular-nums">{value}</p>
          )}
          {description && <p className="text-muted-foreground text-xs">{description}</p>}
        </div>
        {Icon && (
          <div className="text-muted-foreground/50 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg)] p-2 backdrop-blur">
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
    </Card>
  )

  if (href) {
    return (
      <Link href={href}>
        <MotionCard>{card}</MotionCard>
      </Link>
    )
  }

  return card
}
