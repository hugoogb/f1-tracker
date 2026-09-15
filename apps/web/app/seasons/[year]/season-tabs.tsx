'use client'

import type { ReactNode } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface SeasonTabsProps {
  racesContent: ReactNode
  heatmapContent?: ReactNode
  driverStandingsContent: ReactNode
  constructorStandingsContent: ReactNode
  /** Omitted for a season with no results to re-score. */
  whatIfContent?: ReactNode
}

export function SeasonTabs({
  racesContent,
  heatmapContent,
  driverStandingsContent,
  constructorStandingsContent,
  whatIfContent,
}: SeasonTabsProps) {
  return (
    <Tabs defaultValue={0}>
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <TabsList variant="line">
          <TabsTrigger value={0}>Races</TabsTrigger>
          {heatmapContent !== undefined && <TabsTrigger value={1}>Heatmap</TabsTrigger>}
          <TabsTrigger value={2}>Driver Standings</TabsTrigger>
          <TabsTrigger value={3}>Constructor Standings</TabsTrigger>
          {whatIfContent !== undefined && <TabsTrigger value={4}>What If</TabsTrigger>}
        </TabsList>
      </div>
      <TabsContent value={0}>{racesContent}</TabsContent>
      {heatmapContent !== undefined && <TabsContent value={1}>{heatmapContent}</TabsContent>}
      <TabsContent value={2}>{driverStandingsContent}</TabsContent>
      <TabsContent value={3}>{constructorStandingsContent}</TabsContent>
      {whatIfContent !== undefined && <TabsContent value={4}>{whatIfContent}</TabsContent>}
    </Tabs>
  )
}
