import Link from 'next/link'
import { NavLink } from './nav-link'
import { MobileNav } from './mobile-nav'
import { ThemeToggle } from './theme-toggle'
import { SearchDialog } from './search-dialog'

export function Header() {
  return (
    <header className="border-border/40 bg-background/95 supports-[backdrop-filter]:bg-background/60 border-b backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 md:gap-6">
        <MobileNav />
        <Link href="/" className="text-lg font-bold tracking-tight">
          F1 Tracker
        </Link>
        <nav className="hidden items-center gap-6 md:flex">
          <NavLink href="/seasons">Seasons</NavLink>
          <NavLink href="/drivers">Drivers</NavLink>
          <NavLink href="/constructors">Constructors</NavLink>
          <NavLink href="/circuits">Circuits</NavLink>
          <NavLink href="/champions">Champions</NavLink>
          <NavLink href="/compare">Compare</NavLink>
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <SearchDialog />
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
