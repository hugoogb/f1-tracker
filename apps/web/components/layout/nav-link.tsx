'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname()
  const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href)

  return (
    <Link
      href={href}
      className={`hover:text-foreground text-sm font-medium transition-colors ${
        isActive ? 'text-primary' : 'text-muted-foreground'
      }`}
    >
      {children}
    </Link>
  )
}
