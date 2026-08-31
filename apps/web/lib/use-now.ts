'use client'

import { useSyncExternalStore } from 'react'

/**
 * A shared once-per-second clock.
 *
 * One interval drives every subscriber, and `getServerSnapshot` returns null so
 * server-rendered markup carries no timestamp — the countdown placeholder is
 * identical on both sides and hydration stays clean. Reading the clock through
 * an external store (rather than seeding state and updating it in an effect)
 * also keeps the render pure.
 */

const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | null = null
let cachedSeconds = 0

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange)

  if (timer === null) {
    // Refresh on first subscribe: the module may have been loaded long before
    // this component mounted.
    cachedSeconds = nowSeconds()
    timer = setInterval(() => {
      cachedSeconds = nowSeconds()
      for (const listener of listeners) listener()
    }, 1000)
  }

  return () => {
    listeners.delete(onStoreChange)
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }
}

// Must be referentially stable between renders within the same second, so the
// value is cached and only advanced by the interval above.
function getSnapshot(): number {
  return cachedSeconds
}

function getServerSnapshot(): null {
  return null
}

/** Current time in whole seconds, or null during server rendering. */
export function useNowSeconds(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
