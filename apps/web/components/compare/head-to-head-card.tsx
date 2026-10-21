import { Panel, PanelContent, PanelHeader, PanelTitle } from '@/components/ui/panel'

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
  color1,
  color2,
  totalLabel = 'shared races',
}: {
  title: string
  h2h: HeadToHead
  driver1LastName: string
  driver2LastName: string
  /** Team colours for each side; without them the card keeps its default red/blue. */
  color1?: string
  color2?: string
  totalLabel?: string
}) {
  const c1 = color1 ? { color: color1 } : undefined
  const c2 = color2 ? { color: color2 } : undefined
  const bg1 = color1 ? { backgroundColor: color1 } : {}
  const bg2 = color2 ? { backgroundColor: color2 } : {}
  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>{title}</PanelTitle>
      </PanelHeader>
      <PanelContent>
        <div className="flex items-center gap-4">
          <div className="flex-1 text-right">
            <p className="text-primary text-3xl font-bold tabular-nums" style={c1}>
              {h2h.driver1Wins}
            </p>
            <p className="text-muted-foreground text-sm font-medium">{driver1LastName}</p>
          </div>
          <div className="flex flex-col items-center">
            <p className="text-muted-foreground text-sm">from</p>
            <p className="text-lg font-semibold">{h2h.totalRaces}</p>
            <p className="text-muted-foreground text-sm">{totalLabel}</p>
          </div>
          <div className="flex-1">
            <p className="text-side-b text-3xl font-bold tabular-nums" style={c2}>
              {h2h.driver2Wins}
            </p>
            <p className="text-muted-foreground text-sm font-medium">{driver2LastName}</p>
          </div>
        </div>
        {h2h.totalRaces > 0 && (
          <div className="bg-surface-3 mt-4 flex h-4 overflow-hidden">
            <div
              className="bg-primary text-2xs flex items-center justify-center font-bold text-white transition-all duration-500"
              style={{
                width: `${(h2h.driver1Wins / h2h.totalRaces) * 100}%`,
                ...bg1,
              }}
            >
              {h2h.driver1Wins > 0 && `${Math.round((h2h.driver1Wins / h2h.totalRaces) * 100)}%`}
            </div>
            <div
              className="bg-side-b text-2xs flex items-center justify-center font-bold text-white transition-all duration-500"
              style={{
                width: `${(h2h.driver2Wins / h2h.totalRaces) * 100}%`,
                ...bg2,
              }}
            >
              {h2h.driver2Wins > 0 && `${Math.round((h2h.driver2Wins / h2h.totalRaces) * 100)}%`}
            </div>
          </div>
        )}
      </PanelContent>
    </Panel>
  )
}
