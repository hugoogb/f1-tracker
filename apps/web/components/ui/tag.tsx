import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

const VARIANTS = {
  solid: 'bg-foreground text-background',
  red: 'bg-primary text-primary-foreground',
  livery: 'bg-accent-livery text-background',
  outline: 'border border-hairline-strong text-label',
} as const

/** A skewed broadcast tag: round numbers, "Next", short facts. */
export function Tag({
  variant = 'solid',
  className,
  children,
}: {
  variant?: keyof typeof VARIANTS
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'skew-tag font-data text-2xs inline-block px-2.5 py-0.5 font-bold tracking-wider whitespace-nowrap uppercase',
        VARIANTS[variant],
        className,
      )}
    >
      <span>{children}</span>
    </span>
  )
}
