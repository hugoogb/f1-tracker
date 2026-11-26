import Link from 'next/link'
import { Panel, PanelContent, PanelHeader, PanelTitle } from '@/components/ui/panel'
import { Badge } from '@/components/ui/badge'
import { teamColorOf } from '@/lib/utils'
import type { LineageEntry } from '@/lib/types'

interface LineageTimelineProps {
  entries: LineageEntry[]
}

function yearRange(entry: LineageEntry): string {
  if (entry.yearTo === null) return `${entry.yearFrom}–present`
  if (entry.yearTo === entry.yearFrom) return String(entry.yearFrom)
  return `${entry.yearFrom}–${entry.yearTo}`
}

export function LineageTimeline({ entries }: LineageTimelineProps) {
  if (entries.length < 2) return null

  return (
    <Panel>
      <PanelHeader>
        <PanelTitle className="text-base">Team lineage</PanelTitle>
      </PanelHeader>
      <PanelContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          One continuous entry, under {entries.length} names. Each kept its own record — they are
          not added together.
        </p>

        <ol className="space-y-0">
          {entries.map((entry, index) => {
            const color = teamColorOf(entry.constructor.color)
            const last = index === entries.length - 1
            return (
              <li key={`${entry.constructor.ref}-${entry.yearFrom}`} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span
                    className="ring-surface-1 mt-1.5 size-3 shrink-0 rounded-full ring-2"
                    style={{ backgroundColor: color }}
                    aria-hidden
                  />
                  {!last && <span className="bg-border w-px flex-1" aria-hidden />}
                </div>

                <div className={last ? 'pb-0' : 'pb-5'}>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Link
                      href={`/constructors/${entry.constructor.ref}`}
                      className="hover:text-primary font-medium transition-colors"
                    >
                      {entry.constructor.name}
                    </Link>
                    <span className="text-muted-foreground text-sm tabular-nums">
                      {yearRange(entry)}
                    </span>
                    {entry.isCurrent && (
                      <Badge variant="outline" className="text-xs">
                        This page
                      </Badge>
                    )}
                    {entry.stats.championships > 0 && (
                      <Badge className="text-xs">
                        {entry.stats.championships}{' '}
                        {entry.stats.championships === 1 ? 'title' : 'titles'}
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground mt-0.5 text-xs tabular-nums">
                    {entry.stats.entries} {entry.stats.entries === 1 ? 'entry' : 'entries'} ·{' '}
                    {entry.stats.wins} {entry.stats.wins === 1 ? 'win' : 'wins'} ·{' '}
                    {entry.stats.podiums} {entry.stats.podiums === 1 ? 'podium' : 'podiums'}
                  </p>
                </div>
              </li>
            )
          })}
        </ol>
      </PanelContent>
    </Panel>
  )
}
