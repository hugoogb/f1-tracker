import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import { Panel } from '@/components/ui/panel'

export interface ExploreTile {
  eyebrow: string
  title: string
  /** One live fact that makes the tile worth clicking. */
  teaser: string
  href: string
  accent?: string | null
}

/** The distinctive tools, each with a live teaser rather than a bare link. */
export function ExploreGrid({ tiles }: { tiles: ExploreTile[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map((tile) => (
        <li key={tile.href}>
          <Link href={tile.href} className="group focus-ring block h-full">
            <Panel
              accent={tile.accent}
              className="group-hover:bg-surface-2 h-full justify-between gap-6 px-5 transition-colors"
            >
              <div className="space-y-2">
                <p className="label">{tile.eyebrow}</p>
                <p className="display text-3xl">{tile.title}</p>
              </div>
              <div className="flex items-end justify-between gap-3">
                <p className="text-muted-foreground text-sm">{tile.teaser}</p>
                <ArrowRight
                  className="text-primary size-4 shrink-0 transition-transform group-hover:translate-x-1 motion-reduce:transition-none"
                  aria-hidden
                />
              </div>
            </Panel>
          </Link>
        </li>
      ))}
    </ul>
  )
}
