import Link from 'next/link'
import { NavLink } from './nav-link'
import { MobileNav } from './mobile-nav'
import { CommandSearch } from './command-search'

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--glass-border)] bg-[var(--surface-0)]/80 backdrop-blur-xl">
      <div className="accent-line" />
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-4 md:gap-6 md:px-8">
        <MobileNav />
        <Link
          href="/"
          className="font-heading shrink-0 text-lg font-bold tracking-wider whitespace-nowrap uppercase"
        >
          <span className="text-primary">F1</span> Tracker
        </Link>
        {/* Eight links need ~1240px with the logo and search; below that the sheet has them all. */}
        <nav className="hidden items-center gap-1 xl:flex">
          <NavLink href="/seasons">Seasons</NavLink>
          <NavLink href="/drivers">Drivers</NavLink>
          <NavLink href="/constructors">Constructors</NavLink>
          <NavLink href="/circuits">Circuits</NavLink>
          <NavLink href="/champions">Champions</NavLink>
          <NavLink href="/records">Records</NavLink>
          <NavLink href="/best-seasons">Best Seasons</NavLink>
          <NavLink href="/compare">Compare</NavLink>
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <CommandSearch />
        </div>
      </div>
    </header>
  )
}
