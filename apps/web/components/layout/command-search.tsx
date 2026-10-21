'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Building2,
  CalendarDays,
  Clock,
  FileText,
  Flag,
  MapPin,
  Search,
  User,
  Zap,
  type LucideIcon,
} from 'lucide-react'

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useHydrated } from '@/lib/client-only'
import { SEARCH_MIN_LENGTH } from '@/lib/constants'
import { isTypingTarget, shortcutLabel } from '@/lib/keyboard'
import { useRecentlyViewed } from '@/lib/recently-viewed'
import { searchPages } from '@/lib/site-pages'
import { useSearch, type SearchResults } from '@/lib/use-search'
import { cn } from '@/lib/utils'

interface Option {
  href: string
  label: string
  sublabel?: string
  color?: string | null
}

interface Group {
  key: string
  label: string
  icon: LucideIcon
  options: Option[]
}

const QUICK_LINKS: Option[] = [
  { href: '/seasons/current', label: 'Current season', sublabel: 'Standings and calendar' },
  { href: '/best-seasons', label: 'Best seasons', sublabel: 'Closest title fights' },
  { href: '/records', label: 'Records', sublabel: 'All-time leaders' },
  { href: '/compare', label: 'Compare', sublabel: 'Head to head' },
]

function resultGroups(query: string, results: SearchResults): Group[] {
  const groups: Group[] = [
    {
      key: 'pages',
      label: 'Pages',
      icon: FileText,
      options: searchPages(query, 3).map((p) => ({ href: p.href, label: p.title })),
    },
    {
      key: 'seasons',
      label: 'Seasons',
      icon: CalendarDays,
      options: results.seasons.map((s) => ({
        href: `/seasons/${s.year}`,
        label: `${s.year} season`,
      })),
    },
    {
      key: 'races',
      label: 'Races',
      icon: Flag,
      options: results.races.map((r) => ({
        href: `/seasons/${r.year}/races/${r.round}`,
        label: `${r.name} ${r.year}`,
        sublabel: `R${r.round} · ${r.circuitName}`,
      })),
    },
    {
      key: 'drivers',
      label: 'Drivers',
      icon: User,
      options: results.drivers.map((d) => ({
        href: `/drivers/${d.ref}`,
        label: `${d.firstName} ${d.lastName}`,
        sublabel: d.code ?? undefined,
      })),
    },
    {
      key: 'constructors',
      label: 'Teams',
      icon: Building2,
      options: results.constructors.map((c) => ({
        href: `/constructors/${c.ref}`,
        label: c.name,
        sublabel: c.nationality ?? undefined,
        color: c.color,
      })),
    },
    {
      key: 'circuits',
      label: 'Circuits',
      icon: MapPin,
      options: results.circuits.map((c) => ({
        href: `/circuits/${c.ref}`,
        label: c.name,
        sublabel: c.country ?? undefined,
      })),
    },
  ]
  // A typed year means the season or a race is what's wanted; otherwise
  // people come first, and races (matched by name) after them.
  const order = /(?<!\d)(19|20)\d\d(?!\d)/.test(query)
    ? ['pages', 'seasons', 'races', 'drivers', 'constructors', 'circuits']
    : ['pages', 'drivers', 'constructors', 'circuits', 'seasons', 'races']
  return groups
    .filter((g) => g.options.length > 0)
    .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
}

/**
 * The site search: ⌘K / Ctrl+K anywhere, or "/" when not typing. A combobox
 * over one listbox, so arrow keys move through every group and a screen reader
 * hears the highlighted option. With no query it offers quick links and the
 * pages this browser visited recently.
 */
export function CommandSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const router = useRouter()
  const hydrated = useHydrated()
  const recent = useRecentlyViewed()
  const listboxId = useId()
  const inputRef = useRef<HTMLInputElement>(null)

  const { results, failed } = useSearch(query)
  const searching = query.trim().length >= SEARCH_MIN_LENGTH

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((prev) => !prev)
      } else if (
        e.key === '/' &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !isTypingTarget(e.target)
      ) {
        e.preventDefault()
        setOpen(true)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  // A new query starts the highlight back at the top (adjusted during render,
  // so the reset is never painted).
  const [highlightedFor, setHighlightedFor] = useState(query)
  if (highlightedFor !== query) {
    setHighlightedFor(query)
    setActiveIndex(0)
  }

  const groups: Group[] = searching
    ? resultGroups(query, results)
    : [
        { key: 'quick', label: 'Jump to', icon: Zap, options: QUICK_LINKS },
        ...(recent.length > 0
          ? [
              {
                key: 'recent',
                label: 'Recently viewed',
                icon: Clock,
                options: recent.map((r) => ({
                  href: r.href,
                  label: r.label,
                  sublabel: r.kind,
                  color: r.color,
                })),
              },
            ]
          : []),
      ]
  const options = groups.flatMap((g) => g.options)
  const active = Math.min(activeIndex, Math.max(options.length - 1, 0))
  const optionId = (i: number) => `${listboxId}-option-${i}`

  function navigate(href: string) {
    setOpen(false)
    setQuery('')
    router.push(href)
  }

  function onInputKeyDown(e: React.KeyboardEvent) {
    if (options.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((active + 1) % options.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((active - 1 + options.length) % options.length)
    } else if (e.key === 'Enter' && options[active]) {
      e.preventDefault()
      navigate(options[active].href)
    }
  }

  const shortcut = hydrated ? shortcutLabel(navigator.platform) : null

  // Each group's first option's position in the one flat listbox.
  const offsets = groups.map((_, gi) =>
    groups.slice(0, gi).reduce((n, g) => n + g.options.length, 0),
  )

  return (
    <>
      <Button
        variant="outline"
        className="text-muted-foreground hidden h-8 w-52 justify-start gap-2 px-3 normal-case md:flex"
        onClick={() => setOpen(true)}
      >
        <Search className="size-3.5" aria-hidden />
        <span className="font-sans text-sm tracking-normal">Search</span>
        {shortcut && (
          <kbd className="bg-surface-2 text-label text-2xs ml-auto px-1.5 py-0.5 font-medium">
            {shortcut}
          </kbd>
        )}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label="Search"
        onClick={() => setOpen(true)}
      >
        <Search className="size-4" aria-hidden />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          initialFocus={inputRef}
          className="top-[15%] translate-y-0 gap-0 p-0 sm:max-w-xl"
        >
          <DialogTitle className="sr-only">Search F1 Tracker</DialogTitle>
          <div className="border-hairline flex items-center border-b px-3">
            <Search className="text-label size-4 shrink-0" aria-hidden />
            <input
              ref={inputRef}
              role="combobox"
              aria-label="Search F1 Tracker"
              aria-expanded={options.length > 0}
              aria-controls={listboxId}
              aria-autocomplete="list"
              aria-activedescendant={options.length > 0 ? optionId(active) : undefined}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder="Drivers, teams, circuits, seasons, races…"
              className="placeholder:text-muted-foreground h-12 w-full bg-transparent px-3 text-sm outline-none"
            />
          </div>

          <div
            id={listboxId}
            role="listbox"
            aria-label="Results"
            className="max-h-96 overflow-y-auto p-2"
          >
            {groups.map((group, gi) => {
              const Icon = group.icon
              return (
                <div key={group.key} role="group" aria-label={group.label} className="pb-1">
                  <div className="label flex items-center gap-2 px-2 py-1.5" aria-hidden>
                    <Icon className="size-3" />
                    {group.label}
                  </div>
                  {group.options.map((option, oi) => {
                    const i = offsets[gi] + oi
                    const selected = i === active
                    return (
                      <div
                        key={`${group.key}-${option.href}`}
                        id={optionId(i)}
                        role="option"
                        aria-selected={selected}
                        onClick={() => navigate(option.href)}
                        onMouseMove={() => setActiveIndex(i)}
                        className={cn(
                          'flex cursor-pointer items-center gap-3 px-2 py-2 text-sm',
                          selected
                            ? 'bg-surface-2 text-foreground shadow-[inset_2px_0_0_var(--primary)]'
                            : 'text-foreground/90',
                        )}
                      >
                        {option.color !== undefined && (
                          <span
                            aria-hidden
                            className="h-3.5 w-1 shrink-0"
                            style={{ backgroundColor: option.color ?? 'var(--label)' }}
                          />
                        )}
                        <span className="truncate font-medium">{option.label}</span>
                        {option.sublabel && (
                          <span className="font-data text-label text-2xs ml-auto shrink-0 uppercase">
                            {option.sublabel}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}

            {searching && failed && (
              <p className="text-muted-foreground py-8 text-center text-sm">
                Search is unavailable right now. Try again in a moment.
              </p>
            )}
            {searching && !failed && groups.length === 0 && (
              <p className="text-muted-foreground py-8 text-center text-sm">No results found.</p>
            )}
          </div>

          <div className="border-hairline label flex gap-4 border-t px-3 py-2" aria-hidden>
            <span>↑↓ move</span>
            <span>↵ open</span>
            <span>esc close</span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
