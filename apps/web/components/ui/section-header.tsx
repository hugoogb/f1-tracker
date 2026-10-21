import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import { cn } from '@/lib/utils'

/** Eyebrow + section title, with an optional "view all" link on the right. */
export function SectionHeader({
  eyebrow,
  title,
  href,
  linkLabel = 'View all',
  as: Heading = 'h2',
  id,
  className,
}: {
  eyebrow?: string
  title: string
  href?: string
  linkLabel?: string
  as?: 'h2' | 'h3'
  /** For a section's `aria-labelledby`. */
  id?: string
  className?: string
}) {
  return (
    <div className={cn('flex items-end justify-between gap-4', className)}>
      <div className="space-y-1">
        {eyebrow && <p className="label">{eyebrow}</p>}
        <Heading id={id}>{title}</Heading>
      </div>
      {href && (
        <Link
          href={href}
          className="font-data text-primary hover:text-foreground focus-ring inline-flex shrink-0 items-center gap-1 text-xs font-semibold tracking-wider uppercase transition-colors"
        >
          {linkLabel}
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      )}
    </div>
  )
}
