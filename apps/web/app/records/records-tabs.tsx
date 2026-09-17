'use client'

import { useState, type ReactNode } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useHydrated } from '@/lib/client-only'

interface RecordsTabsProps {
  driversContent: ReactNode
  constructorsContent: ReactNode
  /** The filterable explorer. The curated tables stay the default view. */
  exploreContent: ReactNode
}

const DRIVERS = 0
const CONSTRUCTORS = 1
const EXPLORE = 2

/** Query keys the explorer writes, and the only ones that should open its tab. */
const EXPLORER_KEYS = ['entity', 'category', 'era', 'nationality', 'minStarts', 'sort', 'page']

function looksLikeAnExplorerLink(): boolean {
  const params = new URLSearchParams(window.location.search)
  return EXPLORER_KEYS.some((key) => params.has(key))
}

export function RecordsTabs({
  driversContent,
  constructorsContent,
  exploreContent,
}: RecordsTabsProps) {
  // The curated tables are the default view: they are the at-a-glance landing
  // content and the part of this page that gets indexed. A link carrying
  // explorer filters opens on the explorer instead — read through `useHydrated`
  // so the server pass and the first client render agree, and the tab swaps
  // afterwards rather than mismatching during hydration.
  const hydrated = useHydrated()
  const [chosen, setChosen] = useState<number | null>(null)
  const active = chosen ?? (hydrated && looksLikeAnExplorerLink() ? EXPLORE : DRIVERS)

  return (
    <Tabs value={active} onValueChange={(value) => setChosen(Number(value))}>
      <TabsList variant="line">
        <TabsTrigger value={DRIVERS}>Driver Records</TabsTrigger>
        <TabsTrigger value={CONSTRUCTORS}>Constructor Records</TabsTrigger>
        <TabsTrigger value={EXPLORE}>Explore</TabsTrigger>
      </TabsList>
      <TabsContent value={DRIVERS}>{driversContent}</TabsContent>
      <TabsContent value={CONSTRUCTORS}>{constructorsContent}</TabsContent>
      <TabsContent value={EXPLORE}>{exploreContent}</TabsContent>
    </Tabs>
  )
}
