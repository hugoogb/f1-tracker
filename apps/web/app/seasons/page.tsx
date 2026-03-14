import Link from 'next/link'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Seasons | F1 Tracker',
  description: 'Browse every Formula 1 season from 1950 to today.',
}

function groupByDecade(seasons: { year: number }[]) {
  const groups: Record<string, number[]> = {}

  for (const { year } of seasons) {
    const decade = `${Math.floor(year / 10) * 10}s`
    if (!groups[decade]) groups[decade] = []
    groups[decade].push(year)
  }

  return Object.entries(groups).sort(([a], [b]) => parseInt(b) - parseInt(a))
}

export default async function SeasonsPage() {
  const { data: seasons } = await api.seasons.list()
  const decades = groupByDecade(seasons)
  const currentYear = new Date().getFullYear()

  return (
    <div className="space-y-10">
      <PageHeader title="Seasons" description="Every Formula 1 season from 1950 to today." />

      {decades.map(([decade, years]) => (
        <section key={decade}>
          <div className="mb-4 flex items-center gap-3">
            <div className="bg-primary/20 h-6 w-1 rounded-full" />
            <h2>{decade}</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {years.map((year) => {
              const isCurrent = year === currentYear
              return (
                <Link key={year} href={`/seasons/${year}`}>
                  <Card
                    className={`hover:border-primary/30 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                      isCurrent ? 'border-primary/40 card-glow' : ''
                    }`}
                  >
                    <CardHeader className="items-center">
                      <CardTitle className="font-heading text-center text-lg">{year}</CardTitle>
                      {isCurrent && (
                        <Badge variant="default" className="text-xs">
                          Current
                        </Badge>
                      )}
                    </CardHeader>
                  </Card>
                </Link>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
