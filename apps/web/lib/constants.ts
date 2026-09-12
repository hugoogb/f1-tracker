export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api'

// Cache TTL fallback (1 day). Real freshness comes from tag-busting on ingest;
// this is just a backstop if the revalidate webhook ever fails.
export const REVALIDATE_SECONDS = 86400
export const F1_DATA_TAG = 'f1-data'

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
