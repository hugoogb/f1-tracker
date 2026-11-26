'use client'

import { useCallback, useSyncExternalStore } from 'react'

export type FavouriteType = 'driver' | 'constructor' | 'circuit'

export const FAVOURITE_TYPES: readonly FavouriteType[] = ['driver', 'constructor', 'circuit']

export interface FavouriteEntity {
  type: FavouriteType
  ref: string
  name: string
  detail: string | null
  countryCode: string | null
  color: string | null
}

export interface Favourite extends FavouriteEntity {
  addedAt: number
  refreshedAt: number
}

export interface FavouritesSnapshot {
  items: readonly Favourite[]
  loaded: boolean
}

const STORAGE_KEY = 'f1-tracker:favourites:v1'
const SCHEMA_VERSION = 1

export const MAX_FAVOURITES = 100

export const FAVOURITE_STALE_AFTER_MS = 24 * 60 * 60 * 1000

const EMPTY: readonly Favourite[] = Object.freeze([])

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

function ensureLoaded() {
  if (snapshot.loaded || typeof window === 'undefined') return
  snapshot = { items: readStorage(), loaded: true }
}

function readStorage(): readonly Favourite[] {
  try {
    return parse(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    return EMPTY
  }
}

function writeStorage(items: readonly Favourite[]): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, items }))
    return true
  } catch {
    return false
  }
}

const isString = (value: unknown): value is string => typeof value === 'string'

const optionalString = (value: unknown): string | null =>
  isString(value) && value.length > 0 && value.length <= 120 ? value : null

const colorOrNull = (value: unknown): string | null =>
  isString(value) && /^#[0-9a-fA-F]{3,8}$/.test(value) ? value : null

const timestamp = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : Date.now()

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
      color: type === 'constructor' ? colorOrNull(candidate.color) : null,
      addedAt: timestamp(candidate.addedAt),
      refreshedAt: timestamp(candidate.refreshedAt),
    })

    if (items.length >= MAX_FAVOURITES) break
  }

  return items.length > 0 ? items : EMPTY
}

let storageListenerAttached = false

function handleStorageEvent(event: StorageEvent) {
  if (event.key !== null && event.key !== STORAGE_KEY) return
  setItems(readStorage())
}

function subscribe(onChange: () => void) {
  ensureLoaded()

  listeners.add(onChange)

  if (!storageListenerAttached) {
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

function commit(items: readonly Favourite[]) {
  setItems(items)
  writeStorage(items)
}

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

  const next = items.slice()
  next[index] = unchanged
    ? { ...current, refreshedAt: Date.now() }
    : { ...current, ...fresh, refreshedAt: Date.now() }
  commit(next)
}

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

export function useFavourites(): FavouritesSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export function useIsFavourite(type: FavouriteType, ref: string): boolean {
  const read = useCallback(() => isFavourite(type, ref), [type, ref])
  return useSyncExternalStore(subscribe, read, () => false)
}

export function favouriteHref(favourite: Favourite): string {
  if (favourite.type === 'driver') return `/drivers/${favourite.ref}`
  if (favourite.type === 'constructor') return `/constructors/${favourite.ref}`
  return `/circuits/${favourite.ref}`
}

export function nameParts(name: string): { firstName: string; lastName: string } {
  const words = name.trim().split(/\s+/)
  if (words.length < 2) return { firstName: words[0] ?? '', lastName: '' }
  return { firstName: words[0], lastName: words[words.length - 1] }
}
