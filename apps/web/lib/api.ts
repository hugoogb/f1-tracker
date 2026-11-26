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

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404
}

const ENTITY_PATH = /^\/(drivers|constructors|circuits)\/([^/?]+)/
const SEASON_PATH = /^\/(?:seasons|best-seasons)\/(\d{4})(?:[/?]|$)/
const ENTITY_LISTS = new Set(['nationalities', 'countries'])
const ENTITY_KIND = { drivers: 'driver', constructors: 'constructor', circuits: 'circuit' } as const
const REFERENCE_ENDPOINTS = new Set(['/points-systems'])

function cacheScopeFor(endpoint: string): { tags: string[]; revalidate: number } {
  const season = SEASON_PATH.exec(endpoint)
  if (season) {
    const year = Number(season[1])
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
    listUncached: () => fetchApi<{ data: { year: number }[] }>('/seasons', { cache: 'no-store' }),
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
    constructorPermutations: (year: number) =>
      fetchApi(`/seasons/${year}/permutations/constructors`),
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
    list: () => fetchApi<BestSeasonsResponse>('/best-seasons'),
    season: (year: number) => fetchApi<BestSeasonResponse>(`/best-seasons/${year}`),
  },
  pointsSystems: () => fetchApi<{ systems: PointsSystem[] }>('/points-systems'),
  search: (query: string) => {
    const params = new URLSearchParams({ q: query })
    return fetchApi(`/search?${params}`)
  },
  records: Object.assign(() => fetchApi('/records'), {
    explore: (params: RecordsExploreParams, signal?: AbortSignal) =>
      fetchApi<RecordsExploreResponse>(`/records/explore?${recordsExploreQuery(params)}`, {
        signal,
        cache: 'no-store',
      }),
    ranking: (params: RecordsExploreParams) =>
      fetchApi<RecordsExploreResponse>(`/records/explore?${recordsExploreQuery(params)}`),
  }),
  compare: {
    curatedDrivers: (d1: string, d2: string) =>
      fetchApi(`/compare/drivers?${new URLSearchParams({ d1, d2 })}`, {
        next: { tags: [F1_DATA_TAG, entityTag('driver', d1), entityTag('driver', d2)] },
      }),
    curatedConstructors: (c1: string, c2: string) =>
      fetchApi(`/compare/constructors?${new URLSearchParams({ c1, c2 })}`, {
        next: { tags: [F1_DATA_TAG, entityTag('constructor', c1), entityTag('constructor', c2)] },
      }),
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
  seasonCompare: {
    entrants: (year: number) =>
      fetchApi<SeasonCompareEntrants>(`/seasons/${year}/compare/entrants`),
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
    status: () => fetchApi<OpsStatus>('/ops/status', { cache: 'no-store' }),
  },
}
