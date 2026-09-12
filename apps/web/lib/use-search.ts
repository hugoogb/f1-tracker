'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { SEARCH_DEBOUNCE_MS, SEARCH_MIN_LENGTH } from '@/lib/constants'

export interface SearchResults {
  drivers: {
    ref: string
    firstName: string
    lastName: string
    code: string | null
    nationality: string | null
  }[]
  constructors: { ref: string; name: string; nationality: string | null; color: string | null }[]
  circuits: { ref: string; name: string; location: string | null; country: string | null }[]
}

const EMPTY: SearchResults = { drivers: [], constructors: [], circuits: [] }

/**
 * Debounced site search, shared by the header dialog and the compare pickers.
 *
 * This is one of the few places the browser talks to the API directly, so it is
 * also the one that breaks when the API's `CORS_ORIGINS` does not list the
 * site's origin. A blocked fetch rejects with nothing useful, and all three
 * callers used to swallow it and render an empty list — a search box that
 * silently does nothing. `failed` exists so they can say so instead.
 */
export function useSearch(query: string): { results: SearchResults; failed: boolean } {
  const [state, setState] = useState<{ results: SearchResults; failed: boolean }>({
    results: EMPTY,
    failed: false,
  })

  // A query too short to send is an empty result by definition, so it is
  // derived rather than stored — clearing state from inside the effect would
  // just be a second render saying the same thing.
  const searchable = query.length >= SEARCH_MIN_LENGTH

  useEffect(() => {
    if (!searchable) return

    // Guards against an earlier, slower request landing after a later one and
    // overwriting it with results the user has already moved past.
    let current = true

    const timer = setTimeout(async () => {
      try {
        const data = (await api.search(query)) as SearchResults
        if (current) setState({ results: { ...EMPTY, ...data }, failed: false })
      } catch {
        if (current) setState({ results: EMPTY, failed: true })
      }
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [query, searchable])

  return searchable ? state : { results: EMPTY, failed: false }
}
