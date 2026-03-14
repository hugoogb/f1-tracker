import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'

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
  const formattedValue = typeof value === 'number' ? value.toLocaleString() : value

  const content = (
    <Card
      className={cn(
        'relative gap-4 py-5 transition-all duration-200',
        href && 'hover:border-primary/30 card-glow cursor-pointer hover:-translate-y-0.5',
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
          <p className="font-heading text-3xl font-bold tracking-tight tabular-nums">
            {formattedValue}
          </p>
          {description && <p className="text-muted-foreground text-xs">{description}</p>}
        </div>
        {Icon && (
          <div className="text-muted-foreground/50 bg-muted/50 rounded-lg p-2">
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
    </Card>
  )

  if (href) {
    return <Link href={href}>{content}</Link>
  }

  return content
}
