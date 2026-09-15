import { Info } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { SeasonScoring } from '@/lib/types'

interface ScoringNoteProps {
  scoring: SeasonScoring
  year: number
}

function points(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

/**
 * How this season was scored, in one strip under the header.
 *
 * Worth stating plainly because the rules moved so much: a win has been worth
 * 8, 9, 10 and 25 points, the fastest lap has paid and stopped paying twice,
 * and until 1991 a driver's championship total was not the sum of their races.
 * Without that context a standings table from 1958 and one from 2024 look like
 * the same kind of object.
 *
 * The two claims come from different places and are worded to match. The points
 * system is a fact about the year. The dropped-scores line is read off the
 * results — a total below what a driver scored — because the exact "best N"
 * rule changed almost every season and the dataset does not carry it. So the
 * era gets the general statement and the data supplies the example.
 */
export function ScoringNote({ scoring, year }: ScoringNoteProps) {
  const { system, everyResultCounts, droppedPoints } = scoring
  const largest = droppedPoints?.largest
  const driver = largest?.driver

  return (
    <div className="border-border rounded-xl border bg-[var(--surface-1)] px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
          <Info className="size-3.5" aria-hidden />
          Scoring
        </span>
        <Badge variant="outline" className="font-mono text-xs">
          {system.label}
        </Badge>
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
          scored <span className="tabular-nums">{points(largest.scored)}</span> but kept{' '}
          <span className="tabular-nums">{points(largest.counted)}</span>, dropping{' '}
          <span className="tabular-nums">{points(largest.dropped)}</span>
          {droppedPoints.driversAffected > 1 && (
            <> — one of {droppedPoints.driversAffected} drivers whose total was cut</>
          )}
          .
        </p>
      )}
    </div>
  )
}
