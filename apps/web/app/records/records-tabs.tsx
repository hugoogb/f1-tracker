'use client'

import { useState, type ReactNode } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useHydrated } from '@/lib/client-only'

interface RecordsTabsProps {
  driversContent: ReactNode
  constructorsContent: ReactNode
  exploreContent: ReactNode
}

const DRIVERS = 0
const CONSTRUCTORS = 1
const EXPLORE = 2

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
