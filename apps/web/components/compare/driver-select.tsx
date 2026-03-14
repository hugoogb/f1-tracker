'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { API_BASE_URL } from '@/lib/constants'

interface DriverResult {
  ref: string
  firstName: string
  lastName: string
  code: string | null
}

interface DriverSelectProps {
  label: string
  value: string
  onChange: (ref: string, name: string) => void
}

export function DriverSelect({ label, value, onChange }: DriverSelectProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<DriverResult[]>([])
  const [open, setOpen] = useState(false)
  const [selectedName, setSelectedName] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([])
      return
    }
    try {
      const res = await fetch(`${API_BASE_URL}/search?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setResults(data.drivers ?? [])
    } catch {
      setResults([])
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

  return (
    <div ref={containerRef} className="relative">
      <label className="mb-1.5 block text-sm font-medium">{label}</label>
      {value && selectedName ? (
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold">{selectedName}</span>
          <button
            onClick={() => {
              onChange('', '')
              setSelectedName('')
              setQuery('')
            }}
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            Change
          </button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="text-muted-foreground absolute top-2.5 left-2.5 h-4 w-4" />
            <Input
              placeholder="Search for a driver..."
              className="pl-8"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setOpen(true)
              }}
              onFocus={() => setOpen(true)}
            />
          </div>
          {open && results.length > 0 && (
            <div className="border-border bg-popover absolute top-full right-0 left-0 z-50 mt-1 rounded-md border p-1 shadow-md">
              {results.map((d) => (
                <button
                  key={d.ref}
                  className="hover:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm"
                  onClick={() => {
                    const name = `${d.firstName} ${d.lastName}`
                    onChange(d.ref, name)
                    setSelectedName(name)
                    setQuery('')
                    setOpen(false)
                    setResults([])
                  }}
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
        </>
      )}
    </div>
  )
}
