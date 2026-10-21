import { AlertTriangle, Calendar, CheckCircle2, Database, Flag, Timer } from 'lucide-react'

import { api } from '@/lib/api'
import { buildMetadata } from '@/lib/seo'
import type { OpsIngestRun, OpsStatus } from '@/lib/types'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { PageHero } from '@/components/ui/page-hero'
import { Badge } from '@/components/ui/badge'
import { Panel, PanelContent, PanelHeader, PanelTitle } from '@/components/ui/panel'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { LocalDate, LocalDateTime } from '@/components/ui/local-date'
import { FadeIn, StaggerItem, StaggerList } from '@/components/ui/motion'
import { TimeAgo } from '@/components/ops/time-ago'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export const metadata = buildMetadata({
  title: 'Status',
  description:
    'Operational status for F1 Tracker — how much of the championship is loaded, when the data was last ingested, and what is still outstanding.',
  path: '/status',
  noindex: true,
})

/**
 * Rendered per request, never cached.
 *
 * This page used to be ISR with a one-minute TTL, which made it the one route
 * guaranteed to write to the ISR cache on every refresh: `/api/ops/status`
 * stamps `generatedAt` and reports planner row estimates, so no two renders are
 * byte-identical, and Vercel bills a write for every regeneration whose output
 * changed. It is `noindex` and rarely visited, so a function invocation per
 * view is far cheaper than a cache entry rewritten every minute — and it is
 * always current, which is the page's whole job. The fetch in `lib/api.ts` is
 * `no-store` for the same reason.
 *
 * It has to stay a bare literal: route segment config is read by static
 * analysis without evaluating the module.
 */
export const dynamic = 'force-dynamic'

const ROW_COUNT_LABELS: Record<string, string> = {
  seasons: 'Seasons',
  races: 'Races',
  drivers: 'Drivers',
  constructors: 'Constructors',
  circuits: 'Circuits',
  raceResults: 'Race results',
  qualifyingResults: 'Qualifying results',
  sprintResults: 'Sprint results',
  driverStandings: 'Driver standings',
  constructorStandings: 'Constructor standings',
  pitStops: 'Pit stops',
  lapTimes: 'Lap times',
  constructorLineages: 'Constructor lineages',
}

const NEED_LABELS: Record<string, string> = {
  laps: 'Lap times',
  quali_sectors: 'Qualifying sectors',
}

/** Wall-clock length of a run. Arithmetic on two instants, so no locale is involved. */
function runDuration(run: OpsIngestRun): string {
  if (!run.startedAt || !run.finishedAt) return '—'
  const ms = new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

function RunStatusBadge({ status }: { status: OpsIngestRun['status'] }) {
  if (status === 'error') return <Badge variant="destructive">Failed</Badge>
  if (status === 'running') return <Badge variant="secondary">Running</Badge>
  return (
    <Badge variant="outline" className="text-emerald-400">
      OK
    </Badge>
  )
}

function SectionCard({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Panel>
      <PanelHeader className="flex flex-row items-center justify-between gap-3">
        <PanelTitle className="flex items-center gap-2 text-base">
          <Icon className="text-primary h-4 w-4" />
          {title}
        </PanelTitle>
        {action}
      </PanelHeader>
      <PanelContent>{children}</PanelContent>
    </Panel>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
        {label}
      </p>
      <div className="text-sm font-medium">{children}</div>
    </div>
  )
}

function Unreachable() {
  return (
    <FadeIn>
      <Panel className="border-destructive/40">
        <PanelHeader>
          <PanelTitle className="text-destructive flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4" />
            The API is not answering
          </PanelTitle>
        </PanelHeader>
        <PanelContent className="text-muted-foreground space-y-2 text-sm">
          <p>
            This page could not reach the backend, so there is nothing to report on the data behind
            it. That is itself the status: the rest of the site is served from cache and will keep
            working until those entries expire.
          </p>
          <p>The page re-checks on its own; reloading in a minute will pick up a recovery.</p>
        </PanelContent>
      </Panel>
    </FadeIn>
  )
}

/**
 * Shown on hover over an estimated figure. Postgres keeps no cached row count,
 * so an exact COUNT(*) on a large table is a full sequential scan; `reltuples`
 * is the planner's own statistic, maintained by ANALYZE and autovacuum.
 */
const APPROXIMATE_HINT =
  'Estimated from table statistics rather than counted — an exact count would scan the whole table'

export default async function StatusPage() {
  // One call, but the page must render something useful when it fails — an
  // outage is information here, not an error.
  const [result] = await Promise.allSettled([api.ops.status()])
  const status: OpsStatus | null = result.status === 'fulfilled' ? result.value : null
  // Which row counts came back as Postgres' own estimate rather than a real
  // COUNT(*). A Set because it is asked once per rendered row.
  const estimated = new Set(status?.estimatedCounts ?? [])

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Status' }]} />

      <PageHero
        title="Status"
        description="What the database holds, when it was last filled, and what is still outstanding."
        badge={
          status?.schemaVersion ? (
            <Badge variant="outline" className="font-mono">
              {status.schemaVersion}
            </Badge>
          ) : undefined
        }
      />

      {!status ? (
        <Unreachable />
      ) : (
        <>
          <StaggerList className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StaggerItem>
              <StatCard
                label="Seasons"
                value={status.rowCounts.seasons ?? 0}
                icon={Calendar}
                description={
                  status.coverage.firstSeason && status.coverage.lastSeason
                    ? `${status.coverage.firstSeason}–${status.coverage.lastSeason}`
                    : undefined
                }
              />
            </StaggerItem>
            <StaggerItem>
              <StatCard
                label="Races with results"
                value={status.coverage.racesWithResults}
                icon={Flag}
                description={`of ${status.coverage.totalRaces.toLocaleString('en-GB')} on the calendar`}
              />
            </StaggerItem>
            <StaggerItem>
              <StatCard
                label="Lap times"
                value={status.rowCounts.lapTimes ?? 0}
                icon={Timer}
                description={
                  estimated.has('lapTimes')
                    ? 'Fast-F1, 2018 onwards · estimated'
                    : 'Fast-F1, 2018 onwards'
                }
              />
            </StaggerItem>
            <StaggerItem>
              <StatCard
                label="Fast-F1 backlog"
                value={status.fastf1.backlog}
                icon={Database}
                description={
                  status.fastf1.backlog === 0
                    ? 'Nothing outstanding'
                    : 'Races awaiting a manual fetch'
                }
              />
            </StaggerItem>
          </StaggerList>

          <FadeIn>
            <SectionCard title="Freshness" icon={CheckCircle2}>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Last successful ingest">
                  {status.ingest.lastSuccessAt ? (
                    <span className="flex flex-wrap items-baseline gap-2">
                      <LocalDateTime value={status.ingest.lastSuccessAt} />
                      <TimeAgo
                        value={status.ingest.lastSuccessAt}
                        className="text-muted-foreground text-xs"
                      />
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      {status.ingest.available ? 'No run recorded yet' : 'Run log not available'}
                    </span>
                  )}
                </Field>

                <Field label="Latest race result">
                  {status.coverage.latestResult ? (
                    <span className="flex flex-wrap items-baseline gap-2">
                      <span>
                        {status.coverage.latestResult.year} · Round{' '}
                        {status.coverage.latestResult.round}
                      </span>
                      {status.coverage.latestResult.date && (
                        <LocalDate
                          value={status.coverage.latestResult.date}
                          className="text-muted-foreground text-xs"
                        />
                      )}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">None</span>
                  )}
                </Field>

                <Field label="Current season">
                  {status.coverage.currentSeason ? (
                    <span className="flex flex-wrap items-center gap-2">
                      <span>
                        {status.coverage.currentSeason.year} ·{' '}
                        {status.coverage.currentSeason.roundsRun}/
                        {status.coverage.currentSeason.totalRounds} rounds run
                      </span>
                      <Badge variant={status.coverage.seasonInProgress ? 'secondary' : 'outline'}>
                        {status.coverage.seasonInProgress ? 'In progress' : 'Complete'}
                      </Badge>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">None</span>
                  )}
                </Field>
              </div>
            </SectionCard>
          </FadeIn>

          <FadeIn>
            <SectionCard title="Recent ingest runs" icon={Database}>
              {!status.ingest.available ? (
                <EmptyState
                  icon={Database}
                  title="No run log on this database"
                  description="The ingest_runs table has not been migrated in yet, so runs are not being recorded."
                />
              ) : status.ingest.runs.length === 0 ? (
                <EmptyState
                  icon={Database}
                  title="Nothing recorded yet"
                  description="The run log is in place but no ingest has been through it. The next scheduled run will show up here."
                />
              ) : (
                <Table aria-label="Recent ingest runs">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Started</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Duration</TableHead>
                      <TableHead className="text-right">Rows</TableHead>
                      <TableHead>f1db</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {status.ingest.runs.map((run, i) => (
                      <TableRow key={`${run.target}-${run.startedAt}-${i}`}>
                        <TableCell>
                          {run.startedAt ? (
                            <span className="flex flex-col">
                              <LocalDateTime value={run.startedAt} />
                              <TimeAgo
                                value={run.startedAt}
                                className="text-muted-foreground text-xs"
                              />
                            </span>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{run.target}</TableCell>
                        <TableCell>
                          <RunStatusBadge status={run.status} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {runDuration(run)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {run.rowsWritten === null ? '—' : run.rowsWritten.toLocaleString('en-GB')}
                        </TableCell>
                        <TableCell className="text-muted-foreground font-mono text-xs">
                          {run.f1dbVersion ?? '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <p className="text-muted-foreground mt-4 text-xs leading-relaxed">
                A failed run is reported as a failure and nothing more — the exception text stays in
                the database, because it can carry connection details this page has no business
                showing.
              </p>
            </SectionCard>
          </FadeIn>

          <FadeIn>
            <SectionCard
              title="Fast-F1 backlog"
              icon={Timer}
              action={
                <Badge variant={status.fastf1.backlog === 0 ? 'outline' : 'secondary'}>
                  {status.fastf1.backlog} outstanding
                </Badge>
              }
            >
              {status.fastf1.oldest.length === 0 ? (
                <EmptyState
                  icon={CheckCircle2}
                  title="Every session is loaded"
                  description="No race since 2018 is missing lap times or qualifying sector times."
                />
              ) : (
                <Table aria-label="Races awaiting Fast-F1 data">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Season</TableHead>
                      <TableHead>Round</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Missing</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {status.fastf1.oldest.map((entry) => (
                      <TableRow key={`${entry.year}-${entry.round}`}>
                        <TableCell className="tabular-nums">{entry.year}</TableCell>
                        <TableCell className="tabular-nums">{entry.round}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {entry.date ? <LocalDate value={entry.date} /> : '—'}
                        </TableCell>
                        <TableCell>
                          <span className="flex flex-wrap gap-1.5">
                            {entry.need.map((need) => (
                              <Badge key={need} variant="outline" className="text-xs">
                                {NEED_LABELS[need] ?? need}
                              </Badge>
                            ))}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <p className="text-muted-foreground mt-4 text-xs leading-relaxed">
                Formula 1 blocks datacentre IPs, so session timing cannot be fetched by the server
                or in CI. It is pulled from a residential connection and pushed back, which makes
                this backlog a manual job — the oldest few are shown as a sample.
              </p>
            </SectionCard>
          </FadeIn>

          <FadeIn>
            <SectionCard title="Row counts" icon={Database}>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
                {Object.entries(status.rowCounts).map(([key, count]) => (
                  <div
                    key={key}
                    className="flex items-baseline justify-between gap-2 border-b border-[oklch(1_0_0/6%)] pb-2"
                  >
                    <dt className="text-muted-foreground truncate text-xs">
                      {ROW_COUNT_LABELS[key] ?? key}
                    </dt>
                    <dd
                      className="font-mono text-sm tabular-nums"
                      title={estimated.has(key) ? APPROXIMATE_HINT : undefined}
                    >
                      {estimated.has(key) ? '≈\u202F' : ''}
                      {count.toLocaleString('en-GB')}
                    </dd>
                  </div>
                ))}
              </dl>
            </SectionCard>
          </FadeIn>

          <p className="text-muted-foreground text-xs">
            Generated <LocalDateTime value={status.generatedAt} />. This page is cached for a minute
            at a time and refreshed whenever an ingest finishes.
          </p>
        </>
      )}
    </div>
  )
}
