import Link from 'next/link'

import { Panel, PanelContent, PanelHeader, PanelTitle, PanelAction } from '@/components/ui/panel'
import { cn, teamColorOf } from '@/lib/utils'

export interface StandingsRow {
  position: number
  name: string
  sub?: string
  color: string | null
  points: number
  href: string
}

/** Top of a championship as readout rows; the leader on the red slab. */
export function StandingsPanel({
  title,
  href,
  rows,
}: {
  title: string
  href: string
  rows: StandingsRow[]
}) {
  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>{title}</PanelTitle>
        <PanelAction>
          <Link
            href={href}
            className="font-data text-primary hover:text-foreground focus-ring text-xs font-semibold tracking-wider uppercase"
          >
            Full standings
          </Link>
        </PanelAction>
      </PanelHeader>
      <PanelContent>
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">No standings yet this season.</p>
        ) : (
          <ol className="space-y-1">
            {rows.map((row, i) => {
              const leader = i === 0
              return (
                <li key={row.href}>
                  <Link
                    href={row.href}
                    className={cn(
                      'focus-ring grid grid-cols-[2rem_4px_1fr_auto] items-center gap-3 px-3 py-1.5 transition-colors',
                      leader ? 'slab' : 'border-hairline hover:bg-surface-2 border-b border-dashed',
                    )}
                  >
                    <span
                      className={cn(
                        'display text-center text-xl',
                        !leader && 'text-muted-foreground',
                      )}
                    >
                      {row.position}
                    </span>
                    <span
                      aria-hidden
                      className="h-5 -skew-x-12"
                      style={{ backgroundColor: teamColorOf(row.color) ?? undefined }}
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold uppercase">{row.name}</span>
                      {row.sub && (
                        <span
                          className={cn(
                            'block truncate text-xs',
                            leader ? 'text-primary-foreground/80' : 'text-muted-foreground',
                          )}
                        >
                          {row.sub}
                        </span>
                      )}
                    </span>
                    <span className="display text-xl tabular-nums">{row.points}</span>
                  </Link>
                </li>
              )
            })}
          </ol>
        )}
      </PanelContent>
    </Panel>
  )
}
