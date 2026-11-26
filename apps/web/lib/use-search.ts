'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { SEARCH_DEBOUNCE_MS, SEARCH_MIN_LENGTH } from '@/lib/constants'
import { isCurrentFor } from '@/lib/palette'

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
  seasons: { year: number }[]
  races: { year: number; round: number; name: string; circuitName: string; date: string | null }[]
}

const EMPTY: SearchResults = {
  drivers: [],
  constructors: [],
  circuits: [],
  seasons: [],
  races: [],
}

export function useSearch(query: string): {
  results: SearchResults
  failed: boolean
  pending: boolean
} {
  const [state, setState] = useState<{
    results: SearchResults
    failed: boolean
    forQuery: string | null
  }>({
    results: EMPTY,
    failed: false,
    forQuery: null,
  })

  const searchable = query.length >= SEARCH_MIN_LENGTH

  useEffect(() => {
    if (!searchable) return

    let current = true

    const timer = setTimeout(async () => {
      try {
        const data = (await api.search(query)) as SearchResults
        if (current) setState({ results: { ...EMPTY, ...data }, failed: false, forQuery: query })
      } catch {
        if (current) setState({ results: EMPTY, failed: true, forQuery: query })
      }
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [query, searchable])

  return searchable
    ? { results: state.results, failed: state.failed, pending: !isCurrentFor(query, state) }
    : { results: EMPTY, failed: false, pending: false }
}
