'use client'

import { useSyncExternalStore } from 'react'

/**
 * Hooks for the two things the server cannot know: what time it is where the
 * viewer is, and what their locale and timezone are.
 *
 * Both are exposed through `useSyncExternalStore` rather than an effect that
 * calls `setState`. That is what the store is for — the clock genuinely is an
 * external system — and it keeps the server snapshot explicit, so the first
 * client render matches the server's and hydration stays quiet.
 */

const neverChanges = () => () => {}

/**
 * False on the server and for the first client render, true afterwards.
 *
 * Guards anything whose output depends on the browser's locale or timezone: it
 * has to render the server's version first, then swap.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    neverChanges,
    () => true,
    () => false,
  )
}

// One ticker shared by every countdown on the page, rather than one interval
// per component all firing a beat apart.
let now = Date.now()
const listeners = new Set<() => void>()
let ticker: ReturnType<typeof setInterval> | null = null

function subscribeToClock(onChange: () => void) {
  // Re-read on subscribe so the first render after hydration is not showing
  // whatever the clock happened to be when this module was first evaluated.
  now = Date.now()
  listeners.add(onChange)

  ticker ??= setInterval(() => {
    now = Date.now()
    for (const listener of listeners) listener()
  }, 1000)

  return () => {
    listeners.delete(onChange)
    if (listeners.size === 0 && ticker !== null) {
      clearInterval(ticker)
      ticker = null
    }
  }
}

/** Epoch milliseconds, ticking once a second. Null until the client takes over. */
export function useNow(): number | null {
  return useSyncExternalStore(
    subscribeToClock,
    () => now,
    () => null,
  )
}
