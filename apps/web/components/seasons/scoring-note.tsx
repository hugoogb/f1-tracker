import { Info } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { SeasonScoring } from '@/lib/types'
import { formatPoints } from '@/lib/utils'

interface ScoringNoteProps {
  scoring: SeasonScoring
  year: number
}

export function ScoringNote({ scoring, year }: ScoringNoteProps) {
  const { system, everyResultCounts, droppedPoints } = scoring
  const largest = droppedPoints?.largest
  const driver = largest?.driver

  return (
    <div className="brackets border-hairline bg-surface-1 border px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
          <Info className="size-3.5" aria-hidden />
          Scoring
        </span>
        <Badge variant="outline">{system.label}</Badge>
        <span className="text-muted-foreground text-sm">{system.era}</span>
        {system.fastestLapPoint && (
          <Badge variant="outline" className="text-xs">
            + fastest lap
          </Badge>
        )}
        {!everyResultCounts && (
          <Badge variant="outline" className="text-xs">
            Best results only
          </Badge>
        )}
      </div>

      <p className="text-muted-foreground mt-2 text-sm">
        {everyResultCounts ? (
          <>Every result counted towards the {year} championship.</>
        ) : (
          <>
            Only a driver&apos;s best results counted towards the {year} championship — the rest
            were dropped. The number kept changed almost every season and is not in the dataset, so
            the effect is read off the results instead.
          </>
        )}
      </p>

      {largest && driver && (
        <p className="mt-1.5 text-sm">
          <span className="font-medium">
            {driver.firstName} {driver.lastName}
          </span>{' '}
          scored <span className="tabular-nums">{formatPoints(largest.scored)}</span> but kept{' '}
          <span className="tabular-nums">{formatPoints(largest.counted)}</span>, dropping{' '}
          <span className="tabular-nums">{formatPoints(largest.dropped)}</span>
          {droppedPoints.driversAffected > 1 && (
            <> — one of {droppedPoints.driversAffected} drivers whose total was cut</>
          )}
          .
        </p>
      )}
    </div>
  )
}
