import Link from 'next/link'

import { Panel, PanelContent, PanelHeader, PanelTitle, PanelAction } from '@/components/ui/panel'
import { cn, teamColorOf } from '@/lib/utils'

export interface PodiumEntry {
  position: number
  driverName: string
  driverHref: string
  teamName: string | null
  teamColor: string | null
  time: string | null
}

const ORDER = [2, 1, 3]
const HEIGHT: Record<number, string> = { 1: 'h-36', 2: 'h-28', 3: 'h-24' }

/** The last race's podium as three columns in team colours, winner in the middle. */
export function LastRacePodium({
  raceName,
  href,
  podium,
}: {
  raceName: string
  href: string
  podium: PodiumEntry[]
}) {
  const byPosition = new Map(podium.map((p) => [p.position, p]))
  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>Last race · {raceName}</PanelTitle>
        <PanelAction>
          <Link
            href={href}
            className="font-data text-primary hover:text-foreground focus-ring text-xs font-semibold tracking-wider uppercase"
          >
            Full result
          </Link>
        </PanelAction>
      </PanelHeader>
      <PanelContent>
        <ol className="grid grid-cols-3 items-end gap-2">
          {ORDER.map((position) => {
            const entry = byPosition.get(position)
            if (!entry) return <li key={position} />
            const color = teamColorOf(entry.teamColor) ?? undefined
            return (
              <li key={position} className={cn(position === 1 && 'order-none')}>
                <Link
                  href={entry.driverHref}
                  className={cn(
                    'bg-surface-2 hover:bg-surface-3 focus-ring flex flex-col justify-between border-t-[3px] p-3 transition-colors',
                    HEIGHT[position],
                  )}
                  style={{ borderTopColor: color }}
                >
                  <span className="display text-3xl">{position}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold uppercase">
                      {entry.driverName}
                    </span>
                    <span className="font-data text-muted-foreground block truncate text-xs">
                      {position === 1 ? entry.time : entry.teamName}
                    </span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ol>
      </PanelContent>
    </Panel>
  )
}
