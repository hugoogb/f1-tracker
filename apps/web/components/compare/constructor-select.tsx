'use client'

import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useSearch } from '@/lib/use-search'

interface ConstructorSelectProps {
  label: string
  value: string
  onChange: (ref: string, name: string) => void
}

export function ConstructorSelect({ label, value, onChange }: ConstructorSelectProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [selectedName, setSelectedName] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputId = label.toLowerCase().replace(/\s+/g, '-')

  const { results: all, failed } = useSearch(query)
  const results = all.constructors

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
      <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
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
              id={inputId}
              placeholder="Search for a constructor..."
              className="pl-8"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setOpen(true)
              }}
              onFocus={() => setOpen(true)}
              aria-autocomplete="list"
              aria-expanded={open && results.length > 0}
            />
          </div>
          {open && failed && (
            <p className="text-muted-foreground mt-1.5 text-xs">Search is unavailable right now.</p>
          )}
          {open && results.length > 0 && (
            <div
              role="listbox"
              aria-label={`${label} search results`}
              className="border-border bg-popover absolute top-full right-0 left-0 z-50 mt-1 rounded-md border p-1 shadow-md"
            >
              {results.map((c) => (
                <button
                  key={c.ref}
                  role="option"
                  aria-selected={false}
                  className="hover:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm"
                  onClick={() => {
                    onChange(c.ref, c.name)
                    setSelectedName(c.name)
                    setQuery('')
                    setOpen(false)
                  }}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
