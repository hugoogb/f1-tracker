import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'

import { buttonVariants } from '@/components/ui/button-variants'

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
        <div className="text-label mb-4">
          <Icon className="h-12 w-12" strokeWidth={1.25} aria-hidden />
        </div>
      )}
      <h3>{title}</h3>
      {description && <p className="text-muted-foreground mt-1 max-w-sm text-sm">{description}</p>}
      {action && (
        <Link href={action.href} className={cn(buttonVariants(), 'mt-4')}>
          {action.label}
        </Link>
      )}
    </div>
  )
}
