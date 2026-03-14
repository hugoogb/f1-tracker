'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, User, Building2, MapPin } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
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

export function CommandSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResults | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  // Keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults(null)
      return
    }
    try {
      const res = await fetch(`${API_BASE_URL}/search?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setResults(data)
      setActiveIndex(0)
    } catch {
      setResults(null)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => search(query), 200)
    return () => clearTimeout(timer)
  }, [query, search])

  function getAllItems() {
    if (!results) return []
    const items: { type: string; label: string; sublabel?: string; href: string }[] = []
    results.drivers.forEach((d) =>
      items.push({
        type: 'driver',
        label: `${d.firstName} ${d.lastName}`,
        sublabel: d.code ?? undefined,
        href: `/drivers/${d.ref}`,
      }),
    )
    results.constructors.forEach((c) =>
      items.push({
        type: 'constructor',
        label: c.name,
        sublabel: c.nationality ?? undefined,
        href: `/constructors/${c.ref}`,
      }),
    )
    results.circuits.forEach((c) =>
      items.push({
        type: 'circuit',
        label: c.name,
        sublabel: c.country ?? undefined,
        href: `/circuits/${c.ref}`,
      }),
    )
    return items
  }

  function navigate(href: string) {
    setOpen(false)
    setQuery('')
    setResults(null)
    router.push(href)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    const items = getAllItems()
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((prev) => (prev + 1) % items.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((prev) => (prev - 1 + items.length) % items.length)
    } else if (e.key === 'Enter' && items[activeIndex]) {
      e.preventDefault()
      navigate(items[activeIndex].href)
    }
  }

  const iconMap: Record<string, typeof User> = {
    driver: User,
    constructor: Building2,
    circuit: MapPin,
  }

  const allItems = getAllItems()

  // Group items by type for section headers
  const groups = [
    { type: 'driver', label: 'Drivers', items: allItems.filter((i) => i.type === 'driver') },
    {
      type: 'constructor',
      label: 'Constructors',
      items: allItems.filter((i) => i.type === 'constructor'),
    },
    { type: 'circuit', label: 'Circuits', items: allItems.filter((i) => i.type === 'circuit') },
  ].filter((g) => g.items.length > 0)

  return (
    <>
      <Button
        variant="outline"
        className="text-muted-foreground hidden h-8 w-56 justify-start gap-2 px-3 text-sm md:flex"
        onClick={() => setOpen(true)}
      >
        <Search className="h-3.5 w-3.5" />
        <span>Search...</span>
        <kbd className="bg-muted text-muted-foreground ml-auto rounded px-1.5 py-0.5 font-mono text-[10px]">
          ⌘K
        </kbd>
      </Button>
      <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(true)}>
        <Search className="h-4 w-4" />
        <span className="sr-only">Search</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="top-[20%] translate-y-0 gap-0 p-0 sm:max-w-lg"
        >
          <div className="flex items-center border-b px-3">
            <Search className="text-muted-foreground h-4 w-4 shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search drivers, constructors, circuits..."
              className="placeholder:text-muted-foreground h-12 w-full bg-transparent px-3 text-sm outline-none"
              autoFocus
            />
          </div>

          {groups.length > 0 && (
            <div className="max-h-72 overflow-y-auto p-2">
              {groups.map((group) => {
                const GroupIcon = iconMap[group.type]
                return (
                  <div key={group.type}>
                    <div className="text-muted-foreground flex items-center gap-2 px-2 py-1.5 text-xs font-medium">
                      <GroupIcon className="h-3 w-3" />
                      {group.label}
                    </div>
                    {group.items.map((item) => {
                      const globalIndex = allItems.indexOf(item)
                      return (
                        <button
                          key={item.href}
                          className={`flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors ${
                            globalIndex === activeIndex
                              ? 'bg-accent text-accent-foreground'
                              : 'hover:bg-accent/50'
                          }`}
                          onClick={() => navigate(item.href)}
                          onMouseEnter={() => setActiveIndex(globalIndex)}
                        >
                          <span className="font-medium">{item.label}</span>
                          {item.sublabel && (
                            <span className="text-muted-foreground text-xs">{item.sublabel}</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}

          {query.length >= 2 && groups.length === 0 && results && (
            <div className="text-muted-foreground py-8 text-center text-sm">No results found.</div>
          )}

          {query.length < 2 && (
            <div className="text-muted-foreground py-8 text-center text-sm">
              Type at least 2 characters to search...
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
