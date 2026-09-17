'use client'

import { useCallback, useMemo, useSyncExternalStore } from 'react'

/**
 * Favourited drivers, constructors and circuits, kept in `localStorage`.
 *
 * There is no account and no backend here on purpose: the list never leaves the
 * browser it was made in, so there is nothing to identify a viewer with.
 *
 * Every page on this site is rendered on the server and cached, and the server
 * has no `localStorage` — so reading it during render would make the first
 * client pass disagree with the server's markup and hydration would blow up.
 * The way out is the one `lib/client-only.ts` already uses for the clock:
 * `useSyncExternalStore` with an explicit server snapshot. The server (and the
 * first client render) sees an empty list; the real one arrives on subscribe,
 * which React runs after the commit, and the re-render that follows is a normal
 * update rather than a hydration mismatch.
 *
 * Two consequences the callers have to respect:
 *  - `EMPTY`/`SERVER_SNAPSHOT` are shared frozen values. `getServerSnapshot`
 *    must be referentially stable — a fresh `[]` each call is a new identity
 *    every render, and `useSyncExternalStore` would spin forever.
 *  - `loaded` is part of the snapshot rather than a second store, so a view can
 *    tell "no favourites" from "not read yet" in a single consistent read and
 *    never flash an empty state at someone who has ten.
 */

export type FavouriteType = 'driver' | 'constructor' | 'circuit'

export const FAVOURITE_TYPES: readonly FavouriteType[] = ['driver', 'constructor', 'circuit']

/**
 * The display data cached alongside a favourite.
 *
 * It is a cache, not a source of truth: `/favourites` and the home dashboard
 * render from it so they need no API call per entry, and anything that already
 * has fresh data for an entity refreshes it (see `refreshFavourite`).
 *
 * `color` is a constructor livery and only ever comes from a constructor
 * payload — the backend palette is the only place colours are decided. Drivers
 * and circuits carry none: a colour keyed off a driver ref is exactly the bug
 * the project's colour rules exist to prevent.
 */
export interface FavouriteEntity {
  type: FavouriteType
  /** The f1db ref the rest of the app uses (`red-bull`, never `red_bull`). */
  ref: string
  /** Full display name: "Ayrton Senna", "Red Bull", "Silverstone Circuit". */
  name: string
  /** Second line — nationality for people and teams, country for circuits. */
  detail: string | null
  /** ISO 3166-1 alpha-2, for the flag. */
  countryCode: string | null
  /** Constructor livery straight from the API payload; null for everything else. */
  color: string | null
}

export interface Favourite extends FavouriteEntity {
  /** Epoch ms. Orders the lists — newest first. */
  addedAt: number
  /** Epoch ms of the last display-data refresh, so staleness is answerable. */
  refreshedAt: number
}

export interface FavouritesSnapshot {
  items: readonly Favourite[]
  /** False until `localStorage` has been read (server, and first client render). */
  loaded: boolean
}

/**
 * Versioned so a future schema change can be recognised and discarded rather
 * than half-read. Anything that is not v1 is treated as absent.
 */
const STORAGE_KEY = 'f1-tracker:favourites:v1'
const SCHEMA_VERSION = 1

/** A ceiling so a runaway loop or a bored viewer cannot fill the origin's quota. */
export const MAX_FAVOURITES = 100

/** Cached display data older than this is worth re-reading from the API. */
export const FAVOURITE_STALE_AFTER_MS = 24 * 60 * 60 * 1000

const EMPTY: readonly Favourite[] = Object.freeze([])

/**
 * The server's answer, frozen and shared. Returning a new object here would
 * give `useSyncExternalStore` a changed snapshot on every render.
 */
const SERVER_SNAPSHOT: FavouritesSnapshot = Object.freeze({ items: EMPTY, loaded: false })

let snapshot: FavouritesSnapshot = SERVER_SNAPSHOT

const listeners = new Set<() => void>()

const keyOf = (type: FavouriteType, ref: string) => `${type}:${ref}`

function emit() {
  for (const listener of listeners) listener()
}

function setItems(items: readonly Favourite[]) {
  snapshot = { items, loaded: true }
  emit()
}

/**
 * Populates the snapshot from storage *without* notifying anyone.
 *
 * It is called from `getSnapshot`-adjacent reads, which React runs during
 * render, so it must not emit: telling another component to update mid-render
 * is exactly what React warns about. Nothing is lost by staying quiet — the
 * only path that can reach here before the first `subscribe` has no listeners
 * to tell, and React re-reads every snapshot immediately after subscribing.
 */
function ensureLoaded() {
  if (snapshot.loaded || typeof window === 'undefined') return
  snapshot = { items: readStorage(), loaded: true }
}

// ── Storage ─────────────────────────────────────────────────────────────────
// Every read and write is wrapped: `localStorage` throws outright in Safari's
// private mode and wherever site data is blocked, and a starred driver is not
// worth taking the page down for. Favourites simply stop persisting.

function readStorage(): readonly Favourite[] {
  try {
    return parse(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    return EMPTY
  }
}

function writeStorage(items: readonly Favourite[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, items }))
  } catch {
    // Quota exceeded, private mode, blocked site data — the in-memory list
    // still works for this page view, it just will not survive a reload.
  }
}

const isString = (value: unknown): value is string => typeof value === 'string'

const optionalString = (value: unknown): string | null =>
  isString(value) && value.length > 0 && value.length <= 120 ? value : null

/** A CSS hex colour and nothing else — this value reaches a `style` attribute. */
const colorOrNull = (value: unknown): string | null =>
  isString(value) && /^#[0-9a-fA-F]{3,8}$/.test(value) ? value : null

const timestamp = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : Date.now()

/**
 * Defensive to the point of paranoia, because the input is a string a viewer
 * can edit by hand in devtools. Anything unrecognisable is dropped entry by
 * entry; a corrupt blob costs the favourites list, never the app.
 */
function parse(raw: string | null): readonly Favourite[] {
  if (!raw) return EMPTY

  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return EMPTY
  }

  if (typeof data !== 'object' || data === null) return EMPTY
  const payload = data as { version?: unknown; items?: unknown }
  if (payload.version !== SCHEMA_VERSION || !Array.isArray(payload.items)) return EMPTY

  const items: Favourite[] = []
  const seen = new Set<string>()

  for (const entry of payload.items) {
    if (typeof entry !== 'object' || entry === null) continue
    const candidate = entry as Record<string, unknown>

    const type = candidate.type
    if (!isString(type) || !FAVOURITE_TYPES.includes(type as FavouriteType)) continue

    const ref = candidate.ref
    if (!isString(ref) || ref.length === 0 || ref.length > 120) continue

    const key = keyOf(type as FavouriteType, ref)
    if (seen.has(key)) continue
    seen.add(key)

    items.push({
      type: type as FavouriteType,
      ref,
      name: optionalString(candidate.name) ?? ref,
      detail: optionalString(candidate.detail),
      countryCode: optionalString(candidate.countryCode),
      // Only a constructor may carry one, whatever the stored blob claims.
      color: type === 'constructor' ? colorOrNull(candidate.color) : null,
      addedAt: timestamp(candidate.addedAt),
      refreshedAt: timestamp(candidate.refreshedAt),
    })

    if (items.length >= MAX_FAVOURITES) break
  }

  return items.length > 0 ? items : EMPTY
}

// ── Store ───────────────────────────────────────────────────────────────────

let storageListenerAttached = false

function handleStorageEvent(event: StorageEvent) {
  // `key === null` is a `localStorage.clear()` from another tab.
  if (event.key !== null && event.key !== STORAGE_KEY) return
  setItems(readStorage())
}

function subscribe(onChange: () => void) {
  // Read on subscribe rather than at module scope: this runs after the commit,
  // so the value never influences the hydrating render. React re-reads the
  // snapshot straight after subscribing and re-renders if it moved, which is
  // exactly the swap we want.
  ensureLoaded()

  listeners.add(onChange)

  if (!storageListenerAttached) {
    // Fires only in *other* tabs, which is the point: two open tabs stay in
    // step instead of overwriting each other on the next write.
    window.addEventListener('storage', handleStorageEvent)
    storageListenerAttached = true
  }

  return () => {
    listeners.delete(onChange)
    if (listeners.size === 0 && storageListenerAttached) {
      window.removeEventListener('storage', handleStorageEvent)
      storageListenerAttached = false
    }
  }
}

const getSnapshot = () => snapshot
const getServerSnapshot = () => SERVER_SNAPSHOT

// ── Mutations ───────────────────────────────────────────────────────────────

function commit(items: readonly Favourite[]) {
  setItems(items)
  writeStorage(items)
}

/** Current favourites, whether or not a component is watching. */
function currentItems(): readonly Favourite[] {
  ensureLoaded()
  return snapshot.items
}

export function isFavourite(type: FavouriteType, ref: string): boolean {
  return currentItems().some((item) => item.type === type && item.ref === ref)
}

export type AddResult = 'added' | 'full'

export function addFavourite(entity: FavouriteEntity): AddResult {
  const items = currentItems()
  if (items.some((item) => item.type === entity.type && item.ref === entity.ref)) return 'added'
  if (items.length >= MAX_FAVOURITES) return 'full'

  const now = Date.now()
  commit([...items, { ...normalise(entity), addedAt: now, refreshedAt: now }])
  return 'added'
}

export function removeFavourite(type: FavouriteType, ref: string): void {
  const items = currentItems()
  const next = items.filter((item) => !(item.type === type && item.ref === ref))
  if (next.length !== items.length) commit(next.length > 0 ? next : EMPTY)
}

export type ToggleResult = 'added' | 'removed' | 'full'

export function toggleFavourite(entity: FavouriteEntity): ToggleResult {
  if (isFavourite(entity.type, entity.ref)) {
    removeFavourite(entity.type, entity.ref)
    return 'removed'
  }
  return addFavourite(entity)
}

export function clearFavourites(): void {
  commit(EMPTY)
}

/**
 * Updates the cached display data of an entry that is already a favourite.
 *
 * A no-op for anything not favourited — starring is a deliberate act, and a
 * page merely being visited must not add to the list. Writes nothing when the
 * fields are unchanged, so the effect that calls this cannot loop.
 */
export function refreshFavourite(entity: FavouriteEntity): void {
  const items = currentItems()
  const index = items.findIndex((item) => item.type === entity.type && item.ref === entity.ref)
  if (index === -1) return

  const current = items[index]
  const fresh = normalise(entity)
  const unchanged =
    current.name === fresh.name &&
    current.detail === fresh.detail &&
    current.countryCode === fresh.countryCode &&
    current.color === fresh.color

  // Still stamp the clock on an unchanged entry, or a name that never moves
  // would be re-fetched on every visit for ever.
  const next = items.slice()
  next[index] = unchanged
    ? { ...current, refreshedAt: Date.now() }
    : { ...current, ...fresh, refreshedAt: Date.now() }
  commit(next)
}

/** Normalises the display fields, enforcing the colour rule on the way in. */
function normalise(entity: FavouriteEntity): FavouriteEntity {
  return {
    type: entity.type,
    ref: entity.ref,
    name: optionalString(entity.name) ?? entity.ref,
    detail: optionalString(entity.detail),
    countryCode: optionalString(entity.countryCode),
    color: entity.type === 'constructor' ? colorOrNull(entity.color) : null,
  }
}

// ── Hooks ───────────────────────────────────────────────────────────────────

/** The whole list plus whether storage has been read yet. */
export function useFavourites(): FavouritesSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

/**
 * Whether one entity is favourited.
 *
 * A boolean snapshot on purpose: every star on a 50-row list subscribes, and
 * React bails out of re-rendering the 49 whose answer did not change.
 */
export function useIsFavourite(type: FavouriteType, ref: string): boolean {
  const read = useCallback(() => isFavourite(type, ref), [type, ref])
  return useSyncExternalStore(subscribe, read, () => false)
}

/** Favourites of one type, newest first. */
export function useFavouritesOfType(type: FavouriteType): readonly Favourite[] {
  const { items } = useFavourites()
  return useMemo(
    () => items.filter((item) => item.type === type).sort((a, b) => b.addedAt - a.addedAt),
    [items, type],
  )
}

/** Splits a stored display name into the two initials an avatar needs. */
export function nameParts(name: string): { firstName: string; lastName: string } {
  const words = name.trim().split(/\s+/)
  if (words.length < 2) return { firstName: words[0] ?? '', lastName: '' }
  return { firstName: words[0], lastName: words[words.length - 1] }
}
