import type { SeasonCompareAggregateKey, SeasonCompareResponse } from '@/lib/types'
import { Panel, PanelContent, PanelHeader, PanelTitle } from '@/components/ui/panel'
import { cn } from '@/lib/utils'
import { DeltaChip, type Better } from './delta-chip'
import { formatPoints, signed, type SideInfo } from './sides'

interface StatDef {
  key: SeasonCompareAggregateKey
  label: string
  better: Better
  digits?: number
}

const STATS: StatDef[] = [
  { key: 'points', label: 'Points', better: 'higher' },
  { key: 'wins', label: 'Wins', better: 'higher' },
  { key: 'podiums', label: 'Podiums', better: 'higher' },
  { key: 'poles', label: 'Poles', better: 'higher' },
  { key: 'fastestLaps', label: 'Fastest laps', better: 'higher' },
  { key: 'pointsFinishes', label: 'Points finishes', better: 'higher' },
  { key: 'lapsLed', label: 'Laps led', better: 'higher' },
  { key: 'averageGrid', label: 'Avg grid', better: 'lower', digits: 2 },
  { key: 'averageFinish', label: 'Avg finish', better: 'lower', digits: 2 },
  { key: 'dnfs', label: 'DNFs', better: 'lower' },
  { key: 'starts', label: 'Starts', better: 'neutral' },
]

function display(value: number | null, digits?: number): string {
  if (value === null) return '—'
  return digits ? value.toFixed(digits) : formatPoints(value)
}

/**
 * Season totals side by side, each with an A − B chip in the favoured side's colour.
 */
export function StatRows({
  data,
  sides,
}: {
  data: SeasonCompareResponse
  sides: [SideInfo, SideInfo]
}) {
  const [a, b] = sides
  const perCar = data.type === 'constructors'
  const led = data.lapsLedCoverage
  const quali = data.qualifyingGap
  const pace = data.racePace

  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>Season Stats</PanelTitle>
        {perCar && (
          <p className="text-muted-foreground text-xs">
            Totals count every car: two podiums in one race are two podiums.
          </p>
        )}
      </PanelHeader>
      <PanelContent className="space-y-0 divide-y">
        {STATS.map(({ key, label, better, digits }) => {
          const { a: va, b: vb, delta } = data.aggregates[key]
          const aBetter =
            va !== null &&
            vb !== null &&
            better !== 'neutral' &&
            (better === 'higher' ? va > vb : va < vb)
          const bBetter =
            va !== null &&
            vb !== null &&
            better !== 'neutral' &&
            (better === 'higher' ? vb > va : vb < va)
          const note =
            key === 'lapsLed' && led.roundsCovered < led.roundsRaced
              ? led.roundsCovered
                ? `${led.roundsCovered} of ${led.roundsRaced} rounds have lap data`
                : 'No lap-by-lap data this season'
              : null
          return (
            <StatRow
              key={key}
              label={label}
              note={note}
              left={display(va, digits)}
              right={display(vb, digits)}
              leftColor={aBetter ? a.color : undefined}
              rightColor={bBetter ? b.color : undefined}
              chip={
                <DeltaChip
                  delta={delta}
                  better={better}
                  sides={sides}
                  digits={digits && delta !== null && !Number.isInteger(delta) ? digits : 0}
                />
              }
            />
          )
        })}

        <StatRow
          label="Avg quali gap"
          note={
            quali
              ? `Mean ${signed(quali.averageDeltaMs)} ms · median ${signed(quali.medianDeltaPct, 3)}% (one bad session skews the mean) · ${quali.roundsCovered} of ${quali.roundsShared} shared rounds have times`
              : 'No qualifying times to compare'
          }
          left=""
          right=""
          chip={
            <DeltaChip
              delta={quali ? quali.averageDeltaPct : null}
              better="lower"
              sides={sides}
              digits={3}
              suffix="%"
            />
          }
        />
        <StatRow
          label="Race pace"
          note={
            pace
              ? `${signed(pace.averageDeltaMs)} ms per clean lap · ${pace.roundsCovered} of ${pace.roundsShared} shared rounds have lap times`
              : 'No lap times to compare (Fast-F1, 2018 onwards)'
          }
          left=""
          right=""
          chip={
            <DeltaChip
              delta={pace ? pace.averageDeltaPct : null}
              better="lower"
              sides={sides}
              digits={3}
              suffix="%"
            />
          }
        />
      </PanelContent>
    </Panel>
  )
}

function StatRow({
  label,
  note,
  left,
  right,
  leftColor,
  rightColor,
  chip,
}: {
  label: string
  note?: string | null
  left: string
  right: string
  leftColor?: string
  rightColor?: string
  chip: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[1fr_minmax(7rem,auto)_1fr] items-center gap-3 py-3">
      <span
        className={cn(
          'display text-right text-xl tabular-nums',
          !leftColor && 'text-muted-foreground',
        )}
        style={leftColor ? { color: leftColor } : undefined}
      >
        {left}
      </span>
      <div className="flex flex-col items-center gap-1 text-center">
        <span className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
          {label}
        </span>
        {chip}
        {note && <span className="text-muted-foreground text-2xs leading-tight">{note}</span>}
      </div>
      <span
        className={cn('display text-xl tabular-nums', !rightColor && 'text-muted-foreground')}
        style={rightColor ? { color: rightColor } : undefined}
      >
        {right}
      </span>
    </div>
  )
}
