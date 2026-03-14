import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: string
  description?: string
  badge?: ReactNode
  actions?: ReactNode
  className?: string
  children?: ReactNode
}

export function PageHeader({
  title,
  description,
  badge,
  actions,
  className,
  children,
}: PageHeaderProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1>{title}</h1>
          {badge}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {description && <p className="text-muted-foreground max-w-2xl">{description}</p>}
      {children}
    </div>
  )
}
