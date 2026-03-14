import Link from 'next/link'
import { api } from '@/lib/api'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'

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

  return (
    <main className="container mx-auto space-y-10 px-4 py-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Seasons</h1>
        <p className="text-muted-foreground mt-1">Every Formula 1 season from 1950 to today.</p>
      </div>

      {decades.map(([decade, years]) => (
        <section key={decade}>
          <h2 className="mb-4 text-xl font-semibold">{decade}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {years.map((year) => (
              <Link key={year} href={`/seasons/${year}`}>
                <Card className="hover:bg-muted/50 transition-colors">
                  <CardHeader>
                    <CardTitle className="text-center text-lg">{year}</CardTitle>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </main>
  )
}
