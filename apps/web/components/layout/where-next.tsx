import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import { Panel } from '@/components/ui/panel'

export interface WhereNextLink {
  label: string
  href: string
  description?: string
}

/** The foot of every detail page: where to go from here, so no page is a dead end. */
export function WhereNext({ links }: { links: readonly WhereNextLink[] }) {
  if (links.length === 0) return null
  return (
    <nav aria-labelledby="where-next-heading" className="space-y-3">
      <p id="where-next-heading" className="label">
        Where next
      </p>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="group focus-ring block h-full">
              <Panel
                size="sm"
                className="group-hover:bg-surface-2 h-full flex-row items-center justify-between gap-4 px-4 transition-colors"
              >
                <span className="min-w-0">
                  <span className="font-data block text-sm font-semibold tracking-wide uppercase">
                    {link.label}
                  </span>
                  {link.description && (
                    <span className="text-muted-foreground block text-xs">{link.description}</span>
                  )}
                </span>
                <ArrowRight
                  aria-hidden
                  className="text-accent-livery size-4 shrink-0 transition-transform group-hover:translate-x-1 motion-reduce:transition-none"
                />
              </Panel>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
