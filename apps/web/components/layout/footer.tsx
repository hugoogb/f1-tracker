import Link from 'next/link'

import { Container } from '@/components/ui/container'
import { NAV_GROUPS } from '@/lib/nav'

// Every destination in the header, plus the pages only the footer carries.
const sections = [
  ...NAV_GROUPS.map((group) => ({
    label: group.label,
    links: group.items ?? [{ label: group.label, href: group.href! }],
  })),
  {
    label: 'Site',
    links: [
      { label: 'Favourites', href: '/favourites' },
      { label: 'Data status', href: '/status' },
      { label: 'Attributions', href: '/attributions' },
    ],
  },
]

export function Footer() {
  return (
    <footer className="bg-surface-0 border-hairline mt-16 border-t">
      <Container className="py-10">
        <div className="grid gap-8 md:grid-cols-[1.2fr_3fr]">
          <div className="space-y-3">
            <Link
              href="/"
              className="skew-tag bg-primary text-primary-foreground focus-ring inline-block px-3 py-0.5"
            >
              <span className="display text-xl tracking-wide">F1 Tracker</span>
            </Link>
            <p className="text-muted-foreground text-sm">Complete Formula 1 history & analytics</p>
          </div>
          <nav aria-label="Footer" className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
            {sections.map((section) => (
              <div key={section.label} className="space-y-2">
                <p className="label">{section.label}</p>
                <ul className="space-y-1.5">
                  {section.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-muted-foreground hover:text-foreground focus-ring text-sm transition-colors"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
        <div className="border-hairline mt-8 border-t" />
        <div className="text-muted-foreground space-y-3 pt-6 text-xs leading-relaxed">
          <p>
            Formula 1 data from{' '}
            <a
              href="https://github.com/f1db/f1db"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground underline underline-offset-2"
            >
              f1db
            </a>{' '}
            (
            <a
              href="https://creativecommons.org/licenses/by/4.0/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground underline underline-offset-2"
            >
              CC BY 4.0
            </a>
            , modified); session timing from{' '}
            <a
              href="https://github.com/theOehrly/Fast-F1"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground underline underline-offset-2"
            >
              Fast-F1
            </a>
            . Full credits on the{' '}
            <Link
              href="/attributions"
              className="hover:text-foreground underline underline-offset-2"
            >
              attributions page
            </Link>
            .
          </p>
          <p>
            F1 Tracker is unofficial and is not associated in any way with the Formula 1 companies.
            F1, FORMULA ONE, FORMULA 1, FIA FORMULA ONE WORLD CHAMPIONSHIP, GRAND PRIX and related
            marks are trade marks of Formula One Licensing B.V. This is a free, non-commercial fan
            project.
          </p>
        </div>
      </Container>
    </footer>
  )
}
