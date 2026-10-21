import {
  API_BASE_URL,
  REVALIDATE_SECONDS,
  HISTORICAL_REVALIDATE_SECONDS,
  F1_DATA_TAG,
  F1_GLOBAL_TAG,
  F1_REFERENCE_TAG,
  entityTag,
  seasonTag,
} from './constants'
import type {
  BestSeasonResponse,
  BestSeasonsResponse,
  OpsStatus,
  PointsSystem,
  RecordsExploreParams,
  RecordsExploreResponse,
  SeasonCompareEntrants,
  SeasonCompareResponse,
  SeasonCalendarResponse,
} from './types'

/**
 * Carries the upstream status so callers can tell "this driver does not exist"
 * from "the API is down" — the first should render a 404, the second must not.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** True when the API said the resource itself is missing. */
export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404
}

const ENTITY_PATH = /^\/(drivers|constructors|circuits)\/([^/?]+)/
const SEASON_PATH = /^\/(?:seasons|best-seasons)\/(\d{4})(?:[/?]|$)/
/** Second path segments of the entity routers that are lists, not one entity. */
const ENTITY_LISTS = new Set(['nationalities', 'countries'])
const ENTITY_KIND = { drivers: 'driver', constructors: 'constructor', circuits: 'circuit' } as const
/** Endpoints whose data no import changes; see `F1_REFERENCE_TAG`. */
const REFERENCE_ENDPOINTS = new Set(['/points-systems'])

/**
 * The cache scope of one endpoint: the tags its response is stored under and
 * how long it may live.
 *
 * Every entry is tagged `f1-data`, so a full purge still reaches everything,
 * plus one narrower tag the ingest webhook can expire on its own:
 * `f1-season-<year>` for anything under one season (its races, standings,
 * charts), `f1-driver-<ref>` / `f1-constructor-<ref>` / `f1-circuit-<ref>` for
 * one entity's profile, and `f1-global` for everything else. A weekly ingest
 * then only expires the current season, that season's entrants and the global
 * lists — not seventy-odd finished seasons whose race pages are the biggest
 * entries in the cache.
 *
 * Exported for the tests of the tag scheme and for `app/api/revalidate`, which
 * must expire the same names this produces.
 */
export function cacheScopeFor(endpoint: string): { tags: string[]; revalidate: number } {
  const season = SEASON_PATH.exec(endpoint)
  if (season) {
    const year = Number(season[1])
    // A season before the current calendar year is over; the clock only picks
    // the TTL here, never anything that ends up in the response.
    const finished = year < new Date().getUTCFullYear()
    return {
      tags: [F1_DATA_TAG, seasonTag(year)],
      revalidate: finished ? HISTORICAL_REVALIDATE_SECONDS : REVALIDATE_SECONDS,
    }
  }
  const entity = ENTITY_PATH.exec(endpoint)
  if (entity && !ENTITY_LISTS.has(entity[2])) {
    const kind = ENTITY_KIND[entity[1] as keyof typeof ENTITY_KIND]
    return {
      tags: [F1_DATA_TAG, entityTag(kind, decodeURIComponent(entity[2]))],
      revalidate: REVALIDATE_SECONDS,
    }
  }
  if (REFERENCE_ENDPOINTS.has(endpoint)) {
    return { tags: [F1_DATA_TAG, F1_REFERENCE_TAG], revalidate: HISTORICAL_REVALIDATE_SECONDS }
  }
  return { tags: [F1_DATA_TAG, F1_GLOBAL_TAG], revalidate: REVALIDATE_SECONDS }
}

/**
 * Fetches one FastAPI endpoint.
 *
 * Cached in the Data Cache by default — which on Vercel is ISR storage, billed
 * per write. Pass `{ cache: 'no-store' }` for endpoints whose URL space is
 * unbounded (a pair of drivers, a filter combination): each distinct URL would
 * otherwise become its own cache entry, written once and rarely read again.
 */
async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const noStore = options?.cache === 'no-store'
  const { tags, revalidate } = cacheScopeFor(endpoint)
  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    ...(noStore ? {} : { next: { revalidate, tags, ...options?.next } }),
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!res.ok) {
    throw new ApiError(res.status, `API error: ${res.status} ${res.statusText}`)
  }

  return res.json() as Promise<T>
}

/**
 * Serialises explorer filters into the query string the FastAPI endpoint takes.
 *
 * Shared by the browser (which sends it to our own route handler) and that route
 * handler (which sends it on to FastAPI), so the two can never disagree about
 * how a filter is spelled — `nationality` and `country` are the same control in
 * the UI but different parameters upstream, which is exactly the kind of detail
 * that drifts when it is written twice.
 */
export function recordsExploreQuery(params: RecordsExploreParams): URLSearchParams {
  const query = new URLSearchParams({ entity: params.entity, category: params.category })
  if (params.era) query.set('era', params.era)
  if (params.yearFrom !== undefined) query.set('year_from', String(params.yearFrom))
  if (params.yearTo !== undefined) query.set('year_to', String(params.yearTo))
  if (params.nationality) {
    query.set(params.entity === 'driver' ? 'nationality' : 'country', params.nationality)
  }
  if (params.minStarts !== undefined) query.set('min_starts', String(params.minStarts))
  if (params.sort) query.set('sort', params.sort)
  if (params.page) query.set('page', String(params.page))
  if (params.limit) query.set('limit', String(params.limit))
  return query
}

/**
 * The browser's half of the explorer fetch: same origin, no CORS, and an
 * `ApiError` on failure so callers can tell a rejected filter combination (4xx)
 * from an API that is down (5xx) exactly as they can server-side.
 */
export async function fetchRecordsExplore(
  params: RecordsExploreParams,
  signal?: AbortSignal,
): Promise<RecordsExploreResponse> {
  const res = await fetch(`/api/records/explore?${recordsExploreQuery(params)}`, { signal })
  if (!res.ok) {
    throw new ApiError(res.status, `API error: ${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<RecordsExploreResponse>
}

export const api = {
  seasons: {
    list: () => fetchApi<{ data: { year: number }[] }>('/seasons'),
    get: (year: number) => fetchApi(`/seasons/${year}`),
    driverStandings: (year: number) => fetchApi(`/seasons/${year}/standings/drivers`),
    constructorStandings: (year: number) => fetchApi(`/seasons/${year}/standings/constructors`),
    heatmap: (year: number) => fetchApi(`/seasons/${year}/heatmap`),
    standingsProgression: (year: number, top = 10) => {
      const params = new URLSearchParams({ top: String(top) })
      return fetchApi(`/seasons/${year}/standings/progression?${params}`)
    },
    constructorProgression: (year: number, top = 10) => {
      const params = new URLSearchParams({ top: String(top) })
      return fetchApi(`/seasons/${year}/standings/constructors/progression?${params}`)
    },
    permutations: (year: number) => fetchApi(`/seasons/${year}/permutations`),
    normalisedStandings: (year: number, system: string) => {
      const params = new URLSearchParams({ system })
      return fetchApi(`/seasons/${year}/standings/normalised?${params}`)
    },
    calendar: (year: number) => fetchApi<SeasonCalendarResponse>(`/seasons/${year}/calendar`),
  },
  drivers: {
    list: (page = 1, pageSize = 50, nationality?: string) => {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
      if (nationality) params.set('nationality', nationality)
      return fetchApi(`/drivers?${params}`)
    },
    nationalities: () => fetchApi<{ nationalities: string[] }>('/drivers/nationalities'),
    get: (ref: string) => fetchApi(`/drivers/${ref}`),
    seasons: (ref: string) => fetchApi(`/drivers/${ref}/seasons`),
    pace: (ref: string) => fetchApi(`/drivers/${ref}/pace`),
  },
  constructors: {
    list: (page = 1, pageSize = 50, nationality?: string) => {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
      if (nationality) params.set('nationality', nationality)
      return fetchApi(`/constructors?${params}`)
    },
    nationalities: () => fetchApi<{ nationalities: string[] }>('/constructors/nationalities'),
    get: (ref: string) => fetchApi(`/constructors/${ref}`),
    seasons: (ref: string) => fetchApi(`/constructors/${ref}/seasons`),
    lineage: (ref: string) => fetchApi(`/constructors/${ref}/lineage`),
    roster: (ref: string, year?: number) => {
      const params = new URLSearchParams()
      if (year) params.set('year', String(year))
      const qs = params.toString()
      return fetchApi(`/constructors/${ref}/roster${qs ? `?${qs}` : ''}`)
    },
  },
  circuits: {
    list: (page = 1, pageSize = 50, country?: string) => {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
      if (country) params.set('country', country)
      return fetchApi(`/circuits?${params}`)
    },
    countries: () => fetchApi<{ countries: string[] }>('/circuits/countries'),
    get: (ref: string) => fetchApi(`/circuits/${ref}`),
    stats: (ref: string) => fetchApi(`/circuits/${ref}/stats`),
  },
  races: {
    get: (year: number, round: number) => fetchApi(`/seasons/${year}/races/${round}`),
    qualifying: (year: number, round: number) =>
      fetchApi(`/seasons/${year}/races/${round}/qualifying`),
    sprint: (year: number, round: number) => fetchApi(`/seasons/${year}/races/${round}/sprint`),
    pitStops: (year: number, round: number) => fetchApi(`/seasons/${year}/races/${round}/pitstops`),
    pitStopAnalysis: (year: number, round: number) =>
      fetchApi(`/seasons/${year}/races/${round}/pitstops/analysis`),
    positions: (year: number, round: number) =>
      fetchApi(`/seasons/${year}/races/${round}/positions`),
    laps: (year: number, round: number) => fetchApi(`/seasons/${year}/races/${round}/laps`),
    gaps: (year: number, round: number) => fetchApi(`/seasons/${year}/races/${round}/gaps`),
    degradation: (year: number, round: number) =>
      fetchApi(`/seasons/${year}/races/${round}/degradation`),
  },
  champions: () => fetchApi('/champions'),
  bestSeasons: {
    /** Every completed season with its competitiveness metrics, best first. */
    list: () => fetchApi<BestSeasonsResponse>('/best-seasons'),
    season: (year: number) => fetchApi<BestSeasonResponse>(`/best-seasons/${year}`),
  },
  pointsSystems: () => fetchApi<{ systems: PointsSystem[] }>('/points-systems'),
  search: (query: string) => {
    const params = new URLSearchParams({ q: query })
    return fetchApi(`/search?${params}`)
  },
  stats: () =>
    fetchApi<{
      seasons: number
      drivers: number
      constructors: number
      races: number
      circuits: number
    }>('/stats'),
  records: Object.assign(() => fetchApi('/records'), {
    /**
     * The filterable explorer, called server-side like every other endpoint.
     *
     * The explorer's filters change without a navigation, so the request has to
     * happen after the page is in the browser — which would make this the only
     * endpoint the browser talks to directly, and the only one whose failure
     * mode is a CORS rejection. It goes through the same-origin route handler at
     * `app/api/records/explore` instead: the browser calls its own origin and
     * Next calls FastAPI from the server, so `NEXT_PUBLIC_API_URL` never has to
     * be reachable from a visitor's machine.
     */
    explore: (params: RecordsExploreParams, signal?: AbortSignal) =>
      fetchApi<RecordsExploreResponse>(`/records/explore?${recordsExploreQuery(params)}`, {
        signal,
        // Every filter combination is its own URL; the route handler's CDN
        // `Cache-Control` caches the popular ones for free instead.
        cache: 'no-store',
      }),
  }),
  /**
   * Head-to-heads. Not cached: any pair of ~900 drivers is a valid URL, so a
   * cache entry per pair is an unbounded number of ISR writes, almost none of
   * which is ever read twice. The pages reading these are dynamic anyway.
   */
  compare: {
    drivers: (d1: string, d2: string, teammate?: boolean) => {
      const params = new URLSearchParams({ d1, d2 })
      if (teammate) params.set('teammate', 'true')
      return fetchApi(`/compare/drivers?${params}`, { cache: 'no-store' })
    },
    constructors: (c1: string, c2: string) => {
      const params = new URLSearchParams({ c1, c2 })
      return fetchApi(`/compare/constructors?${params}`, { cache: 'no-store' })
    },
  },
  /** Two drivers or two constructors within one season (`/seasons/[year]/compare`). */
  seasonCompare: {
    entrants: (year: number) =>
      fetchApi<SeasonCompareEntrants>(`/seasons/${year}/compare/entrants`),
    // Pairs are not cached, for the same reason as `compare` above.
    constructors: (year: number, c1: string, c2: string) =>
      fetchApi<SeasonCompareResponse>(
        `/seasons/${year}/compare/constructors?${new URLSearchParams({ c1, c2 })}`,
        { cache: 'no-store' },
      ),
    drivers: (year: number, d1: string, d2: string) =>
      fetchApi<SeasonCompareResponse>(
        `/seasons/${year}/compare/drivers?${new URLSearchParams({ d1, d2 })}`,
        { cache: 'no-store' },
      ),
  },
  ops: {
    /**
     * Counts, timestamps and the ingest run log behind `/status`.
     *
     * Never cached. The response carries `generatedAt` and planner row
     * estimates, so no two are identical: every refresh of a cached copy was a
     * guaranteed ISR write, for a `noindex` page few people open. `/status`
     * renders per request instead (see the page).
     */
    status: () => fetchApi<OpsStatus>('/ops/status', { cache: 'no-store' }),
  },
}
