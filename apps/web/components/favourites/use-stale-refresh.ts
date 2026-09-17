'use client'

import { useEffect, useRef } from 'react'

import { api } from '@/lib/api'
import type { Circuit, Constructor, Driver } from '@/lib/types'
import {
  FAVOURITE_STALE_AFTER_MS,
  refreshFavourite,
  type Favourite,
  type FavouriteEntity,
} from '@/lib/favourites'

/** Kept low so a long list cannot open a socket per favourite at once. */
const BATCH_SIZE = 6

async function fetchEntity(favourite: Favourite): Promise<FavouriteEntity> {
  const { type, ref } = favourite

  if (type === 'driver') {
    const driver = (await api.drivers.get(ref)) as Driver
    return {
      type,
      ref,
      name: `${driver.firstName} ${driver.lastName}`,
      detail: driver.nationality,
      countryCode: driver.countryCode,
      // A driver never carries a livery: colours belong to constructors.
      color: null,
    }
  }

  if (type === 'constructor') {
    const constructor = (await api.constructors.get(ref)) as Constructor
    return {
      type,
      ref,
      name: constructor.name,
      detail: constructor.nationality,
      countryCode: constructor.countryCode,
      color: constructor.color,
    }
  }

  const circuit = (await api.circuits.get(ref)) as Circuit
  return {
    type,
    ref,
    name: circuit.name,
    detail: circuit.location ?? circuit.country,
    countryCode: circuit.countryCode,
    color: null,
  }
}

/**
 * Re-reads the cached display data of stale favourites from the API.
 *
 * The cache is what makes `/favourites` render without a request per entry, but
 * a constructor can be renamed and a livery can change, so it cannot be left to
 * rot. Only entries older than a day are refetched, in small batches, and every
 * result goes through `Promise.allSettled` — a favourite the API cannot answer
 * for keeps whatever it was showing rather than disappearing.
 *
 * Runs once per mount: a refresh stamps `refreshedAt`, so re-running on the
 * list it just changed would find nothing to do anyway.
 */
export function useStaleRefresh(items: readonly Favourite[], loaded: boolean): void {
  const started = useRef(false)

  useEffect(() => {
    if (!loaded || started.current) return
    started.current = true

    const cutoff = Date.now() - FAVOURITE_STALE_AFTER_MS
    const stale = items.filter((item) => item.refreshedAt < cutoff)
    if (stale.length === 0) return

    let cancelled = false

    void (async () => {
      for (let i = 0; i < stale.length; i += BATCH_SIZE) {
        if (cancelled) return
        const results = await Promise.allSettled(stale.slice(i, i + BATCH_SIZE).map(fetchEntity))
        if (cancelled) return
        for (const result of results) {
          if (result.status === 'fulfilled') refreshFavourite(result.value)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [items, loaded])
}
