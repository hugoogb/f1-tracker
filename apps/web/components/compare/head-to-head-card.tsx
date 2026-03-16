import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface HeadToHead {
  driver1Wins: number
  driver2Wins: number
  totalRaces: number
}

export function HeadToHeadCard({
  title,
  h2h,
  driver1LastName,
  driver2LastName,
}: {
  title: string
  h2h: HeadToHead
  driver1LastName: string
  driver2LastName: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          <div className="flex-1 text-right">
            <p className="text-primary text-3xl font-bold tabular-nums">{h2h.driver1Wins}</p>
            <p className="text-muted-foreground text-sm font-medium">{driver1LastName}</p>
          </div>
          <div className="flex flex-col items-center">
            <p className="text-muted-foreground text-sm">from</p>
            <p className="text-lg font-semibold">{h2h.totalRaces}</p>
            <p className="text-muted-foreground text-sm">shared races</p>
          </div>
          <div className="flex-1">
            <p className="text-3xl font-bold text-blue-500 tabular-nums">{h2h.driver2Wins}</p>
            <p className="text-muted-foreground text-sm font-medium">{driver2LastName}</p>
          </div>
        </div>
        {h2h.totalRaces > 0 && (
          <div className="bg-muted mt-4 flex h-4 overflow-hidden rounded-full">
            <div
              className="bg-primary flex items-center justify-center rounded-l-full text-[10px] font-bold text-white transition-all duration-500"
              style={{
                width: `${(h2h.driver1Wins / h2h.totalRaces) * 100}%`,
              }}
            >
              {h2h.driver1Wins > 0 && `${Math.round((h2h.driver1Wins / h2h.totalRaces) * 100)}%`}
            </div>
            <div
              className="flex items-center justify-center rounded-r-full bg-blue-500 text-[10px] font-bold text-white transition-all duration-500"
              style={{
                width: `${(h2h.driver2Wins / h2h.totalRaces) * 100}%`,
              }}
            >
              {h2h.driver2Wins > 0 && `${Math.round((h2h.driver2Wins / h2h.totalRaces) * 100)}%`}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
