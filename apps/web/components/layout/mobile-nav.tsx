'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { NavLink } from './nav-link'

export function MobileNav() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="ghost" size="icon" className="md:hidden" />}>
        <Menu className="h-5 w-5" />
        <span className="sr-only">Toggle menu</span>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-6">
        <Link href="/" className="text-lg font-bold tracking-tight" onClick={() => setOpen(false)}>
          <span className="text-primary">F1</span> Tracker
        </Link>
        <nav className="mt-6 flex flex-col gap-4">
          <NavLink href="/seasons">Seasons</NavLink>
          <NavLink href="/drivers">Drivers</NavLink>
          <NavLink href="/constructors">Constructors</NavLink>
          <NavLink href="/circuits">Circuits</NavLink>
          <NavLink href="/champions">Champions</NavLink>
          <NavLink href="/compare">Compare</NavLink>
        </nav>
      </SheetContent>
    </Sheet>
  )
}
