'use client'

import { useSyncExternalStore } from 'react'

const neverChanges = () => () => {}

export function useHydrated(): boolean {
  return useSyncExternalStore(
    neverChanges,
    () => true,
    () => false,
  )
}

let now = Date.now()
const listeners = new Set<() => void>()
let ticker: ReturnType<typeof setInterval> | null = null

function subscribeToClock(onChange: () => void) {
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

export function useNow(): number | null {
  return useSyncExternalStore(
    subscribeToClock,
    () => now,
    () => null,
  )
}
