'use client'

import type { ReactNode } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export interface RaceTab {
  id: string
  label: string
  content: ReactNode
}

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
