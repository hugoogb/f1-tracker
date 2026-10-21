import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/** The one page width: header, footer and every page share it. */
export function Container({
  as: Tag = 'div',
  className,
  children,
  ...props
}: {
  as?: 'div' | 'main' | 'section'
  className?: string
  children: ReactNode
  id?: string
}) {
  return (
    <Tag className={cn('mx-auto w-full max-w-[1400px] px-4 md:px-8', className)} {...props}>
      {children}
    </Tag>
  )
}
