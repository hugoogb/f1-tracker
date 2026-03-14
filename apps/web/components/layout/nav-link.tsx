'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname()
  const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href)

  return (
    <Link
      href={href}
      className={cn(
        'relative rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
        isActive
          ? 'text-primary'
          : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
        isActive &&
          'after:bg-primary after:absolute after:right-3 after:-bottom-[13px] after:left-3 after:h-0.5 after:rounded-full',
      )}
    >
      {children}
    </Link>
  )
}
