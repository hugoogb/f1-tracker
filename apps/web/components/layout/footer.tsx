import Link from 'next/link'

const footerLinks = [
  { label: 'Seasons', href: '/seasons' },
  { label: 'Drivers', href: '/drivers' },
  { label: 'Constructors', href: '/constructors' },
  { label: 'Circuits', href: '/circuits' },
  { label: 'Champions', href: '/champions' },
]

export function Footer() {
  return (
    <footer className="mt-auto">
      <div className="accent-line" />
      <div className="mx-auto max-w-[1400px] px-4 py-8 md:px-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <p className="font-heading font-bold tracking-wider uppercase">
              <span className="text-primary">F1</span> Tracker
            </p>
            <p className="text-muted-foreground text-sm">Complete Formula 1 history & analytics</p>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-2">
            {footerLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-muted-foreground hover:text-foreground text-xs font-semibold tracking-wider uppercase transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="accent-line mt-6" />
        <div className="text-muted-foreground pt-6 text-xs">
          Data from Jolpica-F1 (Ergast) via Fast-F1
        </div>
      </div>
    </footer>
  )
}
