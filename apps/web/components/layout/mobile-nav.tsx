'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, Calendar, Users, Building2, MapPin, Trophy, GitCompareArrows } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/seasons', label: 'Seasons', icon: Calendar },
  { href: '/drivers', label: 'Drivers', icon: Users },
  { href: '/constructors', label: 'Constructors', icon: Building2 },
  { href: '/circuits', label: 'Circuits', icon: MapPin },
  { href: '/champions', label: 'Champions', icon: Trophy },
  { href: '/compare', label: 'Compare', icon: GitCompareArrows },
]

export function MobileNav() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="ghost" size="icon" className="md:hidden" />}>
        <Menu className="h-5 w-5" />
        <span className="sr-only">Toggle menu</span>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-6">
        <Link
          href="/"
          className="font-heading text-lg font-bold tracking-tight"
          onClick={() => setOpen(false)}
        >
          <span className="text-primary">F1</span> Tracker
        </Link>
        <div className="border-border/40 my-4 border-t" />
        <nav className="flex flex-col gap-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive = pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary border-primary border-l-2'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            )
          })}
        </nav>
      </SheetContent>
    </Sheet>
  )
}
