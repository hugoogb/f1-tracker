'use client'

import type { ReactNode } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export interface RaceTab {
  id: string
  label: string
  content: ReactNode
}

/**
 * The race page's tab strip.
 *
 * Which tabs exist depends on the era — sprints from 2021, pit stops from 2012,
 * timing from 2018 — so callers pass the ones they have rather than filling
 * fixed slots. The strip scrolls sideways instead of wrapping, which keeps the
 * whole set reachable on a phone.
 */
export function RaceTabs({ tabs }: { tabs: RaceTab[] }) {
  if (tabs.length === 0) return null

  return (
    <Tabs defaultValue={tabs[0].id}>
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <TabsList variant="line">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {tabs.map((tab) => (
        <TabsContent key={tab.id} value={tab.id}>
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  )
}
