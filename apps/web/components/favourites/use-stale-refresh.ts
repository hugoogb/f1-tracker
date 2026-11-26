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
