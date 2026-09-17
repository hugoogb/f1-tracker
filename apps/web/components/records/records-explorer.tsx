'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { AlertTriangle, ArrowDownWideNarrow, ArrowUpNarrowWide, SearchX } from 'lucide-react'

import { ApiError, fetchRecordsExplore } from '@/lib/api'
import type {
  RecordsExploreCategory,
  RecordsExploreEntity,
  RecordsExploreResponse,
} from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DriverAvatar } from '@/components/ui/driver-avatar'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { PositionBadge } from '@/components/ui/position-badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

/** One selectable era, as `/api/points-systems` describes it. */
export interface ExplorerEra {
  id: string
  label: string
  era: string
}

interface RecordsExplorerProps {
  /**
   * The eras on offer. They are the points-system changes, because those are a
   * documented fact about the sport rather than an invented boundary — see
   * `src/scoring.py`. Empty when the API could not be reached at build time,
   * in which case the era filter simply does not appear.
   */
  eras: ExplorerEra[]
  driverNationalities: string[]
  constructorNationalities: string[]
}

interface Filters {
  entity: RecordsExploreEntity
  category: RecordsExploreCategory
  /** A points-system id, or '' for all time. */
  era: string
  nationality: string
  /** Kept as text so the field can be emptied; '' means "let the API decide". */
  minStarts: string
  sort: 'asc' | 'desc'
}

const PAGE_SIZE = 25

const DEFAULT_FILTERS: Filters = {
  entity: 'driver',
  category: 'wins',
  era: '',
  nationality: '',
  minStarts: '',
  sort: 'desc',
}

const CATEGORIES: {
  value: RecordsExploreCategory
  label: string
  /** Constructors enter each car separately, so "starts" is not the word. */
  constructorLabel?: string
}[] = [
  { value: 'wins', label: 'Wins' },
  { value: 'championships', label: 'Championships' },
  { value: 'podiums', label: 'Podiums' },
  { value: 'poles', label: 'Poles' },
  { value: 'fastest_laps', label: 'Fastest laps' },
  { value: 'starts', label: 'Starts', constructorLabel: 'Entries' },
  { value: 'points', label: 'Points scored' },
  { value: 'win_rate', label: 'Win rate' },
  { value: 'podium_rate', label: 'Podium rate' },
]

const ALL = 'all'

function categoryLabel(category: RecordsExploreCategory, entity: RecordsExploreEntity): string {
  const match = CATEGORIES.find((c) => c.value === category)
  if (!match) return category
  return entity === 'constructor' && match.constructorLabel ? match.constructorLabel : match.label
}

function isCategory(value: string): value is RecordsExploreCategory {
  return CATEGORIES.some((c) => c.value === value)
}

function formatValue(value: number, format: RecordsExploreResponse['format']): string {
  if (format === 'percent') return `${(value * 100).toFixed(1)}%`
  if (format === 'decimal') return Number.isInteger(value) ? String(value) : value.toFixed(1)
  return String(value)
}

/**
 * Read the filters back out of the address bar.
 *
 * The params come from `useSearchParams` in a Suspense-wrapped client
 * component, which is read on the client only — the `/records` page itself
 * never reads `searchParams`, so the route stays in the full route cache
 * instead of becoming server-rendered.
 */
function parseFilters(params: URLSearchParams): { filters: Filters; page: number } {
  const entity = params.get('entity') === 'constructor' ? 'constructor' : 'driver'
  const rawCategory = params.get('category') ?? ''
  const page = Number.parseInt(params.get('page') ?? '1', 10)
  const minStarts = params.get('minStarts') ?? ''
  return {
    filters: {
      entity,
      category: isCategory(rawCategory) ? rawCategory : DEFAULT_FILTERS.category,
      era: params.get('era') ?? '',
      nationality: params.get('nationality') ?? '',
      minStarts: /^\d+$/.test(minStarts) ? minStarts : '',
      sort: params.get('sort') === 'asc' ? 'asc' : 'desc',
    },
    page: Number.isFinite(page) && page > 0 ? page : 1,
  }
}

function serialiseFilters(filters: Filters, page: number): string {
  const params = new URLSearchParams()
  if (filters.entity !== DEFAULT_FILTERS.entity) params.set('entity', filters.entity)
  if (filters.category !== DEFAULT_FILTERS.category) params.set('category', filters.category)
  if (filters.era) params.set('era', filters.era)
  if (filters.nationality) params.set('nationality', filters.nationality)
  if (filters.minStarts) params.set('minStarts', filters.minStarts)
  if (filters.sort !== DEFAULT_FILTERS.sort) params.set('sort', filters.sort)
  if (page > 1) params.set('page', String(page))
  return params.toString()
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
        {label}
      </span>
      {children}
    </div>
  )
}

/**
 * The filterable half of `/records`.
 *
 * The opening filters are read once from `useSearchParams`, and every change
 * after that is client state mirrored back into the query string with
 * `history.replaceState`, so a view stays linkable without the page ever
 * reading `searchParams` — which is what keeps the route in the full route
 * cache. `ListFilter` and `Pagination` could not be reused for the controls for
 * the same reason: both drive `router.push`, which would navigate the route on
 * every filter change.
 *
 * Request status is derived, not assigned. Each set of filters has a key, and
 * the component is loading whenever the last settled request's key is not the
 * current one — so there is exactly one state update per request, in the async
 * callback, and none in an effect body.
 */
export function RecordsExplorer({
  eras,
  driverNationalities,
  constructorNationalities,
}: RecordsExplorerProps) {
  const searchParams = useSearchParams()
  const [restored] = useState(() => parseFilters(new URLSearchParams(searchParams.toString())))
  const [filters, setFilters] = useState<Filters>(restored.filters)
  const [page, setPage] = useState(restored.page)
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<RecordsExploreResponse | null>(null)
  const [settled, setSettled] = useState<{ key: string; error: string | null } | null>(null)

  const requestKey = useMemo(
    () => JSON.stringify([filters, page, attempt]),
    [filters, page, attempt],
  )
  const loading = settled?.key !== requestKey
  const error = settled?.key === requestKey ? settled.error : null

  useEffect(() => {
    const query = serialiseFilters(filters, page)
    const url = query ? `${window.location.pathname}?${query}` : window.location.pathname
    window.history.replaceState(null, '', url)
  }, [filters, page])

  useEffect(() => {
    const controller = new AbortController()
    fetchRecordsExplore(
      {
        entity: filters.entity,
        category: filters.category,
        era: filters.era || undefined,
        nationality: filters.nationality || undefined,
        minStarts: filters.minStarts ? Number(filters.minStarts) : undefined,
        sort: filters.sort,
        page,
        limit: PAGE_SIZE,
      },
      controller.signal,
    )
      .then((data) => {
        setResult(data)
        setSettled({ key: requestKey, error: null })
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        setSettled({
          key: requestKey,
          error:
            reason instanceof ApiError && reason.status >= 400 && reason.status < 500
              ? 'Those filters are not a combination the records API accepts.'
              : 'The records API could not be reached. Nothing is wrong with your filters.',
        })
      })
    return () => controller.abort()
  }, [filters, page, requestKey])

  const update = useCallback((patch: Partial<Filters>) => {
    setPage(1)
    setFilters((current) => {
      const next = { ...current, ...patch }
      // Nationality lists differ per entity, so a stale pick would filter
      // everything away silently.
      if (patch.entity && patch.entity !== current.entity) next.nationality = ''
      return next
    })
  }, [])

  const nationalities = filters.entity === 'driver' ? driverNationalities : constructorNationalities
  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1
  const isConstructor = filters.entity === 'constructor'
  const startsHeading = isConstructor ? 'Entries' : 'Starts'

  const rangeLabel = useMemo(() => {
    if (!result) return null
    if (result.yearFrom === null && result.yearTo === null) return 'All time'
    if (result.yearTo === null) return `${result.yearFrom} onwards`
    return `${result.yearFrom}–${result.yearTo}`
  }, [result])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Explore the records</CardTitle>
        <p className="text-muted-foreground text-sm">
          The same results as the tables above, sliced by era, nationality and a minimum number of{' '}
          {isConstructor ? 'entries' : 'starts'}.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-end gap-3">
          <FilterField label="Records for">
            <div className="flex gap-1" role="group" aria-label="Records for">
              {(['driver', 'constructor'] as const).map((value) => (
                <Button
                  key={value}
                  size="sm"
                  variant={filters.entity === value ? 'default' : 'outline'}
                  aria-pressed={filters.entity === value}
                  onClick={() => update({ entity: value })}
                >
                  {value === 'driver' ? 'Drivers' : 'Constructors'}
                </Button>
              ))}
            </div>
          </FilterField>

          <FilterField label="Category">
            <Select
              value={filters.category}
              onValueChange={(value: string | null) => {
                if (value && isCategory(value)) update({ category: value })
              }}
            >
              <SelectTrigger className="w-[180px]" aria-label="Category">
                <SelectValue>
                  {(value: string | null) =>
                    value && isCategory(value) ? categoryLabel(value, filters.entity) : 'Wins'
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {categoryLabel(option.value, filters.entity)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>

          {eras.length > 0 && (
            <FilterField label="Era">
              <Select
                value={filters.era || ALL}
                onValueChange={(value: string | null) =>
                  update({ era: !value || value === ALL ? '' : value })
                }
              >
                <SelectTrigger className="w-[200px]" aria-label="Era">
                  <SelectValue>
                    {(value: string | null) => {
                      const match = eras.find((era) => era.id === value)
                      return match ? `${match.era} · ${match.label}` : 'All time'
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All time</SelectItem>
                  {eras.map((era) => (
                    <SelectItem key={era.id} value={era.id}>
                      {era.era} · {era.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
          )}

          {nationalities.length > 0 && (
            <FilterField label="Nationality">
              <Select
                value={filters.nationality || ALL}
                onValueChange={(value: string | null) =>
                  update({ nationality: !value || value === ALL ? '' : value })
                }
              >
                <SelectTrigger className="w-[180px]" aria-label="Nationality">
                  <SelectValue>
                    {(value: string | null) => (value && value !== ALL ? value : 'All')}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All</SelectItem>
                  {nationalities.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
          )}

          <FilterField label={`Min ${startsHeading.toLowerCase()}`}>
            <Input
              type="number"
              min={0}
              inputMode="numeric"
              className="w-28"
              aria-label={`Minimum ${startsHeading.toLowerCase()}`}
              placeholder="Any"
              value={filters.minStarts}
              onChange={(event) => update({ minStarts: event.target.value.replace(/[^0-9]/g, '') })}
            />
          </FilterField>

          <Button
            size="sm"
            variant="outline"
            onClick={() => update({ sort: filters.sort === 'desc' ? 'asc' : 'desc' })}
            aria-label={filters.sort === 'desc' ? 'Sort ascending' : 'Sort descending'}
          >
            {filters.sort === 'desc' ? (
              <ArrowDownWideNarrow className="size-4" aria-hidden />
            ) : (
              <ArrowUpNarrowWide className="size-4" aria-hidden />
            )}
            {filters.sort === 'desc' ? 'Highest first' : 'Lowest first'}
          </Button>
        </div>

        {result && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{categoryLabel(result.category, result.entity)}</Badge>
            {rangeLabel && <Badge variant="outline">{rangeLabel}</Badge>}
            {result.nationality && <Badge variant="outline">{result.nationality}</Badge>}
            {result.minStarts > 0 && (
              <Badge variant="outline">
                {result.minStarts}+ {startsHeading.toLowerCase()}
              </Badge>
            )}
          </div>
        )}

        {result && <p className="text-muted-foreground text-xs leading-relaxed">{result.note}</p>}

        <div aria-busy={loading} aria-live="polite">
          {error ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertTriangle className="text-muted-foreground/50 mb-3 size-10" strokeWidth={1} />
              <h3 className="text-base font-semibold">Could not load these records</h3>
              <p className="text-muted-foreground mt-1 max-w-sm text-sm">{error}</p>
              <Button
                size="sm"
                variant="outline"
                className="mt-4"
                onClick={() => setAttempt((n) => n + 1)}
              >
                Try again
              </Button>
            </div>
          ) : loading && !result ? (
            <div className="space-y-2" role="status" aria-label="Loading records">
              {Array.from({ length: 8 }).map((_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : result && result.data.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title="Nothing matches those filters"
              description={`No ${result.entity === 'driver' ? 'driver' : 'constructor'} clears every filter at once. Try a wider era or a lower minimum.`}
            />
          ) : result ? (
            <div className={loading ? 'opacity-50 transition-opacity' : 'transition-opacity'}>
              <Table aria-label={`${categoryLabel(result.category, result.entity)} records`}>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>{result.entity === 'driver' ? 'Driver' : 'Constructor'}</TableHead>
                    <TableHead className="text-right">{result.label}</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">
                      {startsHeading}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.data.map((row) => {
                    const driver = row.driver
                    const constructor = row.constructor
                    const key = driver?.ref ?? constructor?.ref ?? String(row.rank)
                    return (
                      <TableRow key={key}>
                        <TableCell>
                          <PositionBadge position={row.rank} size="sm" />
                        </TableCell>
                        <TableCell>
                          {driver ? (
                            <Link
                              href={`/drivers/${driver.ref}`}
                              className="inline-flex items-center gap-2"
                            >
                              <DriverAvatar
                                firstName={driver.firstName}
                                lastName={driver.lastName}
                              />
                              <span className="hover:text-primary font-medium transition-colors">
                                {driver.firstName} {driver.lastName}
                              </span>
                            </Link>
                          ) : constructor ? (
                            <Link
                              href={`/constructors/${constructor.ref}`}
                              className="inline-flex items-center gap-2"
                            >
                              {constructor.color && (
                                <span
                                  className="inline-block size-3 rounded-full"
                                  style={{ backgroundColor: constructor.color }}
                                />
                              )}
                              <span className="hover:text-primary font-medium transition-colors">
                                {constructor.name}
                              </span>
                            </Link>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {formatValue(row.value, result.format)}
                        </TableCell>
                        <TableCell className="text-muted-foreground hidden text-right font-mono tabular-nums sm:table-cell">
                          {row.starts}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="flex flex-col items-center gap-3 pt-4 sm:flex-row sm:justify-between">
                  <p className="text-muted-foreground text-sm">
                    {(result.page - 1) * result.pageSize + 1}–
                    {Math.min(result.page * result.pageSize, result.total)} of {result.total}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={result.page <= 1 || loading}
                      onClick={() => setPage((current) => Math.max(1, current - 1))}
                    >
                      Previous
                    </Button>
                    <span className="text-muted-foreground px-1 text-sm">
                      {result.page} / {totalPages}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={result.page >= totalPages || loading}
                      onClick={() => setPage((current) => current + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
