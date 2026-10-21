import type { ReactNode } from 'react'

import { FadeIn } from '@/components/ui/motion'
import { liveryStyle } from '@/lib/livery'
import { cn } from '@/lib/utils'

interface PageHeroProps {
  title: ReactNode
  eyebrow?: ReactNode
  description?: ReactNode
  badge?: ReactNode
  tags?: ReactNode
  actions?: ReactNode
  /** Puts the hero (and so its stripe and brackets) in a team's colours. */
  livery?: string | null
  /** Large faint text behind the title on the right, e.g. a car number. */
  watermark?: string
  className?: string
  children?: ReactNode
}

/** The header of every page: display-type title over a livery stripe. */
export function PageHero({
  title,
  eyebrow,
  description,
  badge,
  tags,
  actions,
  livery,
  watermark,
  className,
  children,
}: PageHeroProps) {
  return (
    <FadeIn>
      <div style={liveryStyle(livery)} className={cn('relative space-y-3', className)}>
        {watermark && (
          <span
            aria-hidden
            className="display text-foreground/[0.06] pointer-events-none absolute -top-6 right-0 text-[9rem] select-none md:text-[12rem]"
          >
            {watermark}
          </span>
        )}
        {eyebrow && <div className="label relative">{eyebrow}</div>}
        {tags && <div className="relative flex flex-wrap items-center gap-2">{tags}</div>}
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 items-end gap-3">
            <h1 className="min-w-0 break-words">{title}</h1>
            {badge}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {description && <p className="text-muted-foreground relative max-w-2xl">{description}</p>}
        {children}
        <div aria-hidden className="relative flex h-0.5 w-full">
          <span className="bg-accent-livery w-2/3" />
          <span className="bg-primary ml-1 w-8" />
        </div>
      </div>
    </FadeIn>
  )
}
