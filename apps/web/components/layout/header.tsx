import Link from 'next/link'
import { Star } from 'lucide-react'

import { Container } from '@/components/ui/container'
import { buttonVariants } from '@/components/ui/button-variants'
import { MainNav } from './main-nav'
import { MobileNav } from './mobile-nav'
import { CommandSearch } from './command-search'

/** Renders on every page and fetches nothing, so it never adds a cache tag. */
export function Header() {
  return (
    <header className="bg-surface-0 border-hairline sticky top-0 z-40 border-b">
      <Container className="flex h-14 items-center gap-3 md:gap-6">
        <MobileNav />
        <Link
          href="/"
          aria-label="F1 Tracker home"
          className="skew-tag bg-primary text-primary-foreground focus-ring shrink-0 px-3 py-0.5"
        >
          <span className="display text-xl tracking-wide">F1 Tracker</span>
        </Link>
        <MainNav />
        <div className="ml-auto flex items-center gap-1">
          <CommandSearch />
          <Link
            href="/favourites"
            aria-label="Favourites"
            className={buttonVariants({ variant: 'ghost', size: 'icon' })}
          >
            <Star className="size-4" aria-hidden />
          </Link>
        </div>
      </Container>
    </header>
  )
}
