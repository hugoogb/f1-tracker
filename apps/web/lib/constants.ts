export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api'

// Cache TTL fallback (1 day). Real freshness comes from tag-busting on ingest;
// this is just a backstop if the revalidate webhook ever fails.
export const REVALIDATE_SECONDS = 86400

// TTL for responses about a season that is over (any year before the current
// one). Nothing the weekly ingest does changes them, so re-rendering them daily
// only spends function time; a full purge (`purge_cache.sh --all`) still
// reaches them through `F1_DATA_TAG` when a backfill or an f1db correction does.
export const HISTORICAL_REVALIDATE_SECONDS = 2592000 // 30 days

// Every cached fetch carries `F1_DATA_TAG` (the full purge) plus exactly one
// scoped tag from `cacheTagsFor` in `lib/api.ts`, so the ingest webhook can
// expire only what an import can have changed. See `app/api/revalidate`.
export const F1_DATA_TAG = 'f1-data'
/** Everything not bound to one season or one entity: lists, records, champions, stats. */
export const F1_GLOBAL_TAG = 'f1-global'
/**
 * Reference data no import can change (the points systems). Kept off
 * `F1_GLOBAL_TAG` on purpose: every season page reads it, and a fetch's tags
 * become the page's tags, so expiring it on each ingest would re-render all
 * seventy-odd finished season pages. Only a full purge reaches it.
 */
export const F1_REFERENCE_TAG = 'f1-reference'
export const seasonTag = (year: number) => `f1-season-${year}`
export const entityTag = (kind: 'driver' | 'constructor' | 'circuit', ref: string) =>
  `f1-${kind}-${ref}`

// CDN lifetime of the records explorer's same-origin route handler. CDN hits
// are free on Vercel; the upstream fetch behind it is not cached at all, so
// the unbounded filter combinations never become ISR cache entries.
export const EXPLORE_CDN_MAX_AGE_SECONDS = 3600

// Compound colours are tokens (--tyre-*) in app/globals.css.
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
