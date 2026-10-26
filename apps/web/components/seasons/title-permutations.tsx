import type { ReactNode } from 'react'
import { Panel, PanelContent, PanelHeader, PanelTitle } from '@/components/ui/panel'
import { Badge } from '@/components/ui/badge'
import { DriverAvatar } from '@/components/ui/driver-avatar'
import { ConstructorLogo } from '@/components/ui/constructor-logo'
import { TitlePermutationsTabs } from '@/components/seasons/title-permutations-tabs'
import type {
  ConstructorPermutationsResponse,
  PermutationsResponse,
  TitleContender,
  ConstructorTitleContender,
} from '@/lib/types'

interface TitlePermutationsProps {
  drivers: PermutationsResponse | null
  constructors?: ConstructorPermutationsResponse | null
}

function points(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

/** A season with rounds left to run; a finished one's standings already answer it. */
function isLive(data: PermutationsResponse<unknown> | null | undefined): boolean {
  return Boolean(data?.started && !data.seasonComplete && data.contenders.length > 0)
}

/** What a row needs, whichever championship it belongs to. */
interface Row {
  key: string
  name: string
  short: string
  mark: ReactNode
  contender: TitleContender | ConstructorTitleContender
}

function driverRows(data: PermutationsResponse): Row[] {
  return data.contenders.map((c) => ({
    key: c.driver.ref,
    name: c.driver.lastName,
    short: c.driver.code ?? c.driver.lastName,
    mark: <DriverAvatar firstName={c.driver.firstName} lastName={c.driver.lastName} />,
    contender: c,
  }))
}

function constructorRows(data: ConstructorPermutationsResponse): Row[] {
  return data.contenders.map((c) => ({
    key: c.constructor.ref,
    name: c.constructor.name,
    short: c.constructor.name,
    mark: <ConstructorLogo name={c.constructor.name} color={c.constructor.color} />,
    contender: c,
  }))
}

/**
 * Who can still win the drivers' and constructors' titles, and what the
 * leader needs. Tabs when both are live, a single panel otherwise.
 *
 * "Still in it" is the strict mathematical test: out only once every remaining
 * point could not carry a contender past the leader's current total. That
 * assumes the leader never scores again, so the list stays longer than
 * anyone's realistic shortlist. The copy says as much rather than implying
 * these are all live contenders.
 */
export function TitlePermutations({ drivers, constructors }: TitlePermutationsProps) {
  const driversLive = isLive(drivers)
  const constructorsLive = isLive(constructors)
  if (!driversLive && !constructorsLive) return null

  const driversBody = driversLive ? (
    <PermutationsBody data={drivers!} rows={driverRows(drivers!)} kind="drivers" />
  ) : null
  const constructorsBody = constructorsLive ? (
    <PermutationsBody
      data={constructors!}
      rows={constructorRows(constructors!)}
      kind="constructors"
    />
  ) : null

  return (
    <Panel>
      <PanelHeader>
        <PanelTitle className="text-base">Title permutations</PanelTitle>
      </PanelHeader>
      <PanelContent>
        {driversBody && constructorsBody ? (
          <TitlePermutationsTabs
            driversContent={driversBody}
            constructorsContent={constructorsBody}
          />
        ) : (
          (driversBody ?? constructorsBody)
        )}
      </PanelContent>
    </Panel>
  )
}

function PermutationsBody({
  data,
  rows,
  kind,
}: {
  data: PermutationsResponse<unknown>
  rows: Row[]
  kind: 'drivers' | 'constructors'
}) {
  const leader = rows.find((r) => r.contender.isLeader)
  if (!leader) return null
  const aliveCount = rows.filter((r) => r.contender.alive).length
  const isTeams = kind === 'constructors'
  const title = isTeams ? "Constructors' championship" : "Drivers' championship"

  return (
    <div className="space-y-4 pt-2">
      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
        {title}
        {data.decided ? (
          <Badge>Mathematically decided</Badge>
        ) : (
          <Badge variant="outline">{aliveCount} still in it</Badge>
        )}
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Rounds run" value={`${data.roundsRun} of ${data.totalRounds}`} />
        <Stat
          label="Races left"
          value={String(data.racesRemaining ?? 0)}
          hint={
            data.sprintsRemaining
              ? `+ ${data.sprintsRemaining} sprint${data.sprintsRemaining === 1 ? '' : 's'}`
              : undefined
          }
        />
        <Stat
          label="Points available"
          value={points(data.maxRemaining ?? 0)}
          hint={
            data.doublePointsFinale
              ? 'finale pays double'
              : isTeams
                ? 'a one-two every round'
                : undefined
          }
        />
        <Stat
          label={data.decided ? 'Champion' : 'Leads by'}
          value={
            data.decided
              ? leader.short
              : points(rows.find((r) => !r.contender.isLeader)?.contender.deficit ?? 0)
          }
        />
      </div>

      {!data.decided && data.nextRound && data.canClinchNextRound && (
        <p className="text-sm">
          <span className="font-medium">{leader.name}</span> can seal it at round{' '}
          {data.nextRound.round} ({data.nextRound.name}) by taking{' '}
          {isTeams ? 'a one-two' : 'maximum points'} there while{' '}
          {isTeams ? 'no rival team scores' : 'no rival scores'}.
        </p>
      )}

      {data.decided && (
        <p className="text-sm">
          Nobody else can overhaul {leader.name} with {points(data.maxRemaining ?? 0)} points left,
          so the title is settled with {data.racesRemaining}{' '}
          {data.racesRemaining === 1 ? 'round' : 'rounds'} to spare.
        </p>
      )}

      <ul className="divide-border divide-y">
        {rows.slice(0, 10).map(({ key, name, mark, contender }) => (
          <li
            key={key}
            className={`flex items-center gap-3 py-2 ${contender.alive ? '' : 'opacity-45'}`}
          >
            <span className="text-muted-foreground w-5 text-sm tabular-nums">
              {contender.position}
            </span>
            {mark}
            <span className="font-medium">{name}</span>
            {contender.onlyOnCountback && (
              <Badge variant="outline" className="text-xs">
                On countback
              </Badge>
            )}
            {!contender.alive && (
              <Badge variant="outline" className="text-xs">
                Out
              </Badge>
            )}
            <span className="ml-auto text-sm tabular-nums">{points(contender.points)}</span>
            <span className="text-muted-foreground w-20 text-right text-xs tabular-nums">
              max {points(contender.maxPossible)}
            </span>
          </li>
        ))}
      </ul>

      <p className="text-muted-foreground text-xs">
        {isTeams ? 'A team' : 'A driver'} counts as still in it until every remaining point could
        not take {isTeams ? 'it' : 'them'} past the leader&apos;s total today — which assumes the
        leader scores nothing for the rest of the year, so the list runs longer than the realistic
        one. Drawing level means {isTeams ? 'a one-two in' : 'winning'} every remaining race, so the
        countback that breaks the tie (most wins, then second places, and so on) is already known: a
        rival who could only draw level and would lose it is out.
      </p>
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border-hairline bg-surface-2 border px-3 py-2">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  )
}
