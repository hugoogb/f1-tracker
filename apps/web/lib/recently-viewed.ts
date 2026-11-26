'use client'

import { useSyncExternalStore } from 'react'

export interface RecentItem {
  href: string
  label: string
  kind: 'driver' | 'constructor' | 'circuit' | 'season' | 'race'
  color?: string | null
}

const KEY = 'f1-recently-viewed'
const MAX = 6
const EMPTY: readonly RecentItem[] = Object.freeze([])

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' || !localStorage ? null : localStorage
  } catch {
    return null
  }
}

function isRecentItem(value: unknown): value is RecentItem {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return typeof v.href === 'string' && typeof v.label === 'string' && typeof v.kind === 'string'
}

function readRaw(): string | null {
  try {
    return storage()?.getItem(KEY) ?? null
  } catch {
    return null
  }
}

function parse(raw: string | null): RecentItem[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isRecentItem).slice(0, MAX) : []
  } catch {
    return []
  }
}

export function readRecent(): RecentItem[] {
  return parse(readRaw())
}

const listeners = new Set<() => void>()

export function recordVisit(item: RecentItem): void {
  const next = [item, ...readRecent().filter((r) => r.href !== item.href)].slice(0, MAX)
  try {
    storage()?.setItem(KEY, JSON.stringify(next))
  } catch {
    return
  }
  listeners.forEach((l) => l())
}

let cachedRaw: string | null = null
let cachedItems: readonly RecentItem[] = EMPTY

function snapshot(): readonly RecentItem[] {
  const raw = readRaw()
  if (raw !== cachedRaw) {
    cachedRaw = raw
    const items = parse(raw)
    cachedItems = items.length ? Object.freeze(items) : EMPTY
  }
  return cachedItems
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

export function useRecentlyViewed(): readonly RecentItem[] {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY)
}
