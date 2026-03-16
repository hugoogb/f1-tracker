export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api'

export const TEAM_COLORS: Record<string, string> = {
  red_bull: '#3671C6',
  mercedes: '#27F4D2',
  ferrari: '#E8002D',
  mclaren: '#FF8000',
  aston_martin: '#229971',
  alpine: '#FF87BC',
  williams: '#64C4FF',
  haas: '#B6BABD',
  rb: '#6692FF',
  sauber: '#52E252',
} as const

export const TYRE_COLORS: Record<string, string> = {
  SOFT: '#FF3333',
  MEDIUM: '#FFC906',
  HARD: '#CCCCCC',
  INTERMEDIATE: '#39B54A',
  WET: '#0067FF',
  UNKNOWN: '#888888',
  TEST_UNKNOWN: '#888888',
} as const

export const SEARCH_MIN_LENGTH = 2
export const SEARCH_DEBOUNCE_MS = 200
