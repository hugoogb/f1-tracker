'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { API_BASE_URL } from '@/lib/constants'

interface SearchResults {
  drivers: {
    ref: string
    firstName: string
    lastName: string
    code: string | null
    nationality: string | null
  }[]
  constructors: { ref: string; name: string; nationality: string | null }[]
  circuits: { ref: string; name: string; location: string | null; country: string | null }[]
}

export function SearchDialog() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResults | null>(null)
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults(null)
      return
    }
    try {
      const res = await fetch(`${API_BASE_URL}/search?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setResults(data)
    } catch {
      setResults(null)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => search(query), 300)
    return () => clearTimeout(timer)
  }, [query, search])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function navigate(path: string) {
    setOpen(false)
    setQuery('')
    setResults(null)
    router.push(path)
  }

  const hasResults =
    results &&
    (results.drivers.length > 0 || results.constructors.length > 0 || results.circuits.length > 0)

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="text-muted-foreground absolute top-2.5 left-2.5 h-4 w-4" />
        <Input
          placeholder="Search..."
          className="h-9 w-48 pl-8 lg:w-64"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
        />
      </div>
      {open && hasResults && (
        <div className="border-border bg-popover absolute top-full right-0 z-50 mt-1 w-80 rounded-md border p-2 shadow-md">
          {results.drivers.length > 0 && (
            <div>
              <p className="text-muted-foreground mb-1 px-2 text-xs font-medium">Drivers</p>
              {results.drivers.map((d) => (
                <button
                  key={d.ref}
                  className="hover:bg-accent flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors"
                  onClick={() => navigate(`/drivers/${d.ref}`)}
                >
                  {d.code && (
                    <span className="text-muted-foreground font-mono text-xs">{d.code}</span>
                  )}
                  <span>
                    {d.firstName} {d.lastName}
                  </span>
                </button>
              ))}
            </div>
          )}
          {results.constructors.length > 0 && (
            <div className={results.drivers.length > 0 ? 'border-border mt-2 border-t pt-2' : ''}>
              <p className="text-muted-foreground mb-1 px-2 text-xs font-medium">Constructors</p>
              {results.constructors.map((c) => (
                <button
                  key={c.ref}
                  className="hover:bg-accent flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors"
                  onClick={() => navigate(`/constructors/${c.ref}`)}
                >
                  <span>{c.name}</span>
                </button>
              ))}
            </div>
          )}
          {results.circuits.length > 0 && (
            <div
              className={
                results.drivers.length > 0 || results.constructors.length > 0
                  ? 'border-border mt-2 border-t pt-2'
                  : ''
              }
            >
              <p className="text-muted-foreground mb-1 px-2 text-xs font-medium">Circuits</p>
              {results.circuits.map((c) => (
                <button
                  key={c.ref}
                  className="hover:bg-accent flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors"
                  onClick={() => navigate(`/circuits/${c.ref}`)}
                >
                  <span>{c.name}</span>
                  {c.country && <span className="text-muted-foreground text-xs">{c.country}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
