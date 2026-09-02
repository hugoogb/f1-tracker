import Link from 'next/link'

const footerLinks = [
  { label: 'Seasons', href: '/seasons' },
  { label: 'Drivers', href: '/drivers' },
  { label: 'Constructors', href: '/constructors' },
  { label: 'Circuits', href: '/circuits' },
  { label: 'Champions', href: '/champions' },
  { label: 'Attributions', href: '/attributions' },
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
        <div className="text-muted-foreground space-y-3 pt-6 text-xs leading-relaxed">
          <p>
            Formula 1 data from{' '}
            <a
              href="https://github.com/jolpica/jolpica-f1"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground underline underline-offset-2"
            >
              Jolpica-F1
            </a>{' '}
            (Ergast) via{' '}
            <a
              href="https://github.com/theOehrly/Fast-F1"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground underline underline-offset-2"
            >
              Fast-F1
            </a>
            , licensed{' '}
            <a
              href="https://creativecommons.org/licenses/by-nc-sa/4.0/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground underline underline-offset-2"
            >
              CC BY-NC-SA 4.0
            </a>{' '}
            and modified. Circuit layouts by julesr0y (CC BY 4.0); map geometry from Natural Earth
            (public domain). Full credits on the{' '}
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
      </div>
    </footer>
  )
}
