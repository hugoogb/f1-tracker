import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'

import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: { label: string; href: string }
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 text-center', className)}>
      {Icon && (
        <div className="text-muted-foreground/40 mb-4">
          <Icon className="h-16 w-16" strokeWidth={1} />
        </div>
      )}
      <h3 className="text-lg font-semibold">{title}</h3>
      {description && <p className="text-muted-foreground mt-1 max-w-sm text-sm">{description}</p>}
      {action && (
        <Link
          href={action.href}
          className="border-border bg-background hover:bg-muted mt-4 inline-flex h-8 items-center rounded-lg border px-2.5 text-sm font-medium transition-colors"
        >
          {action.label}
        </Link>
      )}
    </div>
  )
}
