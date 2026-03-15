import { API_BASE_URL } from './constants'

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`)
  }

  return res.json() as Promise<T>
}

export const api = {
  seasons: {
    list: () => fetchApi<{ data: { year: number }[] }>('/seasons'),
    get: (year: number) => fetchApi(`/seasons/${year}`),
    driverStandings: (year: number) => fetchApi(`/seasons/${year}/standings/drivers`),
    constructorStandings: (year: number) => fetchApi(`/seasons/${year}/standings/constructors`),
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
    roster: (ref: string, year?: number) => {
      const params = year ? `?year=${year}` : ''
      return fetchApi(`/constructors/${ref}/roster${params}`)
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
  },
  races: {
    get: (year: number, round: number) => fetchApi(`/seasons/${year}/races/${round}`),
    qualifying: (year: number, round: number) =>
      fetchApi(`/seasons/${year}/races/${round}/qualifying`),
    sprint: (year: number, round: number) => fetchApi(`/seasons/${year}/races/${round}/sprint`),
    pitStops: (year: number, round: number) => fetchApi(`/seasons/${year}/races/${round}/pitstops`),
    laps: (year: number, round: number) => fetchApi(`/seasons/${year}/races/${round}/laps`),
  },
  champions: () => fetchApi('/champions'),
  search: (query: string) => fetchApi(`/search?q=${encodeURIComponent(query)}`),
  stats: () =>
    fetchApi<{
      seasons: number
      drivers: number
      constructors: number
      races: number
      circuits: number
    }>('/stats'),
  compare: {
    drivers: (d1: string, d2: string) => fetchApi(`/compare/drivers?d1=${d1}&d2=${d2}`),
  },
}
