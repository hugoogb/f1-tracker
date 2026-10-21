'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, Star } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { NAV_GROUPS, isActiveHref } from '@/lib/nav'
import { cn } from '@/lib/utils'

/** Below `lg`: the same groups as the header, in a sheet from the bottom. */
export function MobileNav() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  const link = (href: string, label: string) => {
    const active = isActiveHref(pathname, href)
    return (
      <Link
        key={href}
        href={href}
        onClick={() => setOpen(false)}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'font-data focus-ring flex items-center px-3 py-2.5 text-sm font-semibold tracking-wider uppercase transition-colors',
          active
            ? 'bg-surface-2 text-foreground shadow-[inset_2px_0_0_var(--primary)]'
            : 'text-muted-foreground hover:text-foreground hover:bg-surface-2',
        )}
      >
        {label}
      </Link>
    )
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={<Button variant="ghost" size="icon" className="lg:hidden" aria-label="Menu" />}
      >
        <Menu className="size-5" aria-hidden />
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto p-4 pb-8">
        <SheetTitle className="label">Navigate</SheetTitle>
        <nav aria-label="Main" className="grid gap-4 sm:grid-cols-2">
          {NAV_GROUPS.map((group) =>
            group.items ? (
              <div key={group.label}>
                <p className="label px-3 pb-1">{group.label}</p>
                {group.items.map((item) => link(item.href, item.label))}
              </div>
            ) : (
              <div key={group.label}>{link(group.href!, group.label)}</div>
            ),
          )}
          <Link
            href="/favourites"
            onClick={() => setOpen(false)}
            className="font-data text-muted-foreground hover:text-foreground focus-ring flex items-center gap-2 px-3 py-2.5 text-sm font-semibold tracking-wider uppercase"
          >
            <Star className="size-4" aria-hidden />
            Favourites
          </Link>
        </nav>
      </SheetContent>
    </Sheet>
  )
}
