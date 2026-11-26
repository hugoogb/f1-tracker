export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api'

export const REVALIDATE_SECONDS = 86400

export const HISTORICAL_REVALIDATE_SECONDS = 2592000

export const F1_DATA_TAG = 'f1-data'
export const F1_GLOBAL_TAG = 'f1-global'
export const F1_REFERENCE_TAG = 'f1-reference'
export const seasonTag = (year: number) => `f1-season-${year}`
export const entityTag = (kind: 'driver' | 'constructor' | 'circuit', ref: string) =>
  `f1-${kind}-${ref}`

export const EXPLORE_CDN_MAX_AGE_SECONDS = 3600

export const TYRE_COLORS: Record<string, string> = {
  HYPERSOFT: 'var(--tyre-hypersoft)',
  ULTRASOFT: 'var(--tyre-ultrasoft)',
  SUPERSOFT: 'var(--tyre-soft)',
  SOFT: 'var(--tyre-soft)',
  MEDIUM: 'var(--tyre-medium)',
  HARD: 'var(--tyre-hard)',
  INTERMEDIATE: 'var(--tyre-inter)',
  WET: 'var(--tyre-wet)',
  UNKNOWN: 'var(--tyre-unknown)',
  TEST_UNKNOWN: 'var(--tyre-unknown)',
} as const

export const SEARCH_MIN_LENGTH = 2
export const SEARCH_DEBOUNCE_MS = 200
