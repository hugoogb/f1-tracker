import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { FadeIn } from '@/components/ui/motion'

export const metadata = {
  title: 'Attributions',
  description:
    'Data sources, licences and trademark notices for F1 Tracker — an unofficial, non-commercial Formula 1 fan project.',
}

interface SourceEntry {
  name: string
  href: string
  used: string
  licence: string
  licenceHref?: string
}

const DATA_SOURCES: SourceEntry[] = [
  {
    name: 'jolpica-f1 (Ergast successor)',
    href: 'https://github.com/jolpica/jolpica-f1',
    used: 'Seasons, races, circuits, drivers, constructors, results, qualifying, sprint, pit stops and standings',
    licence: 'CC BY-NC-SA 4.0',
    licenceHref: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
  },
  {
    name: 'Fast-F1',
    href: 'https://github.com/theOehrly/Fast-F1',
    used: 'API client, plus lap times, tyre stints and qualifying sector times (2018+)',
    licence: 'MIT',
    licenceHref: 'https://github.com/theOehrly/Fast-F1/blob/master/LICENSE',
  },
  {
    name: 'f1-circuits-svg by julesr0y',
    href: 'https://github.com/julesr0y/f1-circuits-svg',
    used: 'Circuit layout drawings',
    licence: 'CC BY 4.0',
    licenceHref: 'https://creativecommons.org/licenses/by/4.0/',
  },
  {
    name: 'Natural Earth',
    href: 'https://www.naturalearthdata.com/',
    used: 'Country outlines behind the circuit world map',
    licence: 'Public domain',
    licenceHref: 'https://www.naturalearthdata.com/about/terms-of-use/',
  },
]

export default function AttributionsPage() {
  return (
    <div className="space-y-10">
      <PageHeader
        title="Attributions"
        description="F1 Tracker is an unofficial, non-commercial fan project. Every data source and image it uses is credited here."
      />

      <FadeIn>
        <Card className="border-primary/40">
          <CardContent className="space-y-3 pt-6 text-sm leading-relaxed">
            <h2 className="font-heading text-base font-bold tracking-wider uppercase">
              Trademark notice
            </h2>
            <p className="text-muted-foreground">
              F1 Tracker is unofficial and is not associated in any way with the Formula 1
              companies. F1, FORMULA ONE, FORMULA 1, FIA FORMULA ONE WORLD CHAMPIONSHIP, GRAND PRIX
              and related marks are trade marks of Formula One Licensing B.V.
            </p>
            <p className="text-muted-foreground">
              Constructor and driver names are used for identification and editorial purposes only.
              No team logos, badges or driver photographs are reproduced on this site.
            </p>
          </CardContent>
        </Card>
      </FadeIn>

      <FadeIn>
        <section className="space-y-4">
          <h2 className="font-heading text-lg font-bold tracking-wider uppercase">Sources</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {DATA_SOURCES.map((source) => (
              <Card key={source.name}>
                <CardContent className="space-y-2 pt-6">
                  <a
                    href={source.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary font-semibold hover:underline"
                  >
                    {source.name}
                  </a>
                  <p className="text-muted-foreground text-sm">{source.used}</p>
                  <p className="text-xs">
                    <span className="text-muted-foreground">Licence: </span>
                    {source.licenceHref ? (
                      <a
                        href={source.licenceHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        {source.licence}
                      </a>
                    ) : (
                      source.licence
                    )}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </FadeIn>

      <FadeIn>
        <section className="space-y-4">
          <h2 className="font-heading text-lg font-bold tracking-wider uppercase">
            Data licence &amp; reuse
          </h2>
          <Card>
            <CardContent className="text-muted-foreground space-y-3 pt-6 text-sm leading-relaxed">
              <p>
                Formula 1 results data comes from the{' '}
                <a
                  href="https://github.com/jolpica/jolpica-f1"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground hover:underline"
                >
                  jolpica-f1 API
                </a>{' '}
                (successor to the Ergast Developer API), licensed{' '}
                <a
                  href="https://creativecommons.org/licenses/by-nc-sa/4.0/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground hover:underline"
                >
                  CC BY-NC-SA 4.0
                </a>
                . It has been modified: reshaped into a relational schema and augmented with derived
                statistics.
              </p>
              <p>
                Under ShareAlike, the dataset published by this project is offered under the same CC
                BY-NC-SA 4.0 licence. That licence is{' '}
                <strong className="text-foreground">non-commercial</strong>: this site carries no
                advertising, no paid tier and no sponsorship, and any reuse of its data must stay
                non-commercial too.
              </p>
              <p>
                The project&apos;s own source code is MIT licensed. Driver photographs and team
                badges are deliberately not used: every available source carried its own licence,
                trademark or attribution obligation, so drivers and teams are shown as initials on
                the team colour instead.
              </p>
            </CardContent>
          </Card>
        </section>
      </FadeIn>

      <FadeIn>
        <section className="space-y-3">
          <h2 className="font-heading text-lg font-bold tracking-wider uppercase">
            Rights holders
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            If you hold rights to something used here and believe it is used improperly, please open
            an issue at{' '}
            <a
              href="https://github.com/hugoogb/f1-tracker/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground hover:underline"
            >
              github.com/hugoogb/f1-tracker
            </a>{' '}
            and it will be removed promptly.
          </p>
        </section>
      </FadeIn>
    </div>
  )
}
