'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Menu,
  Calendar,
  Users,
  Building2,
  MapPin,
  Trophy,
  Award,
  GitCompareArrows,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/seasons', label: 'Seasons', icon: Calendar },
  { href: '/drivers', label: 'Drivers', icon: Users },
  { href: '/constructors', label: 'Constructors', icon: Building2 },
  { href: '/circuits', label: 'Circuits', icon: MapPin },
  { href: '/champions', label: 'Champions', icon: Trophy },
  { href: '/records', label: 'Records', icon: Award },
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
      <SheetContent
        side="left"
        className="w-64 border-r border-[var(--glass-border)] bg-[var(--surface-0)]/95 p-6 backdrop-blur-xl"
      >
        <Link
          href="/"
          className="font-heading text-lg font-bold tracking-wider uppercase"
          onClick={() => setOpen(false)}
        >
          <span className="text-primary">F1</span> Tracker
        </Link>
        <div className="accent-line my-4" />
        <nav className="flex flex-col gap-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive = pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-semibold tracking-wider uppercase transition-colors',
                  isActive
                    ? 'border-primary bg-primary/10 text-primary border-l-2'
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
