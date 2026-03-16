import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface DriverStats {
  total_races: number
  wins: number
  podiums: number
  poles: number
  fastest_laps: number
  total_points: number
}

const statLabels = [
  { key: 'total_races' as const, label: 'Races' },
  { key: 'wins' as const, label: 'Wins' },
  { key: 'podiums' as const, label: 'Podiums' },
  { key: 'poles' as const, label: 'Poles' },
  { key: 'fastest_laps' as const, label: 'Fastest Laps' },
  { key: 'total_points' as const, label: 'Points' },
]

export function CareerStatsTable({
  driver1Stats,
  driver2Stats,
}: {
  driver1Stats: DriverStats
  driver2Stats: DriverStats
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Career Stats</CardTitle>
      </CardHeader>
      <CardContent className="space-y-0 divide-y">
        {statLabels.map(({ key, label }) => {
          const v1 = driver1Stats[key]
          const v2 = driver2Stats[key]
          const d1Higher = v1 > v2
          const d2Higher = v2 > v1

          return (
            <div key={key} className="flex items-center py-3">
              <span
                className={cn(
                  'font-heading flex-1 text-right text-xl font-bold tabular-nums',
                  d1Higher ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                {v1.toLocaleString()}
              </span>
              <span className="text-muted-foreground w-28 text-center text-sm font-medium">
                {label}
              </span>
              <span
                className={cn(
                  'font-heading flex-1 text-xl font-bold tabular-nums',
                  d2Higher ? 'text-blue-500' : 'text-muted-foreground',
                )}
              >
                {v2.toLocaleString()}
              </span>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
