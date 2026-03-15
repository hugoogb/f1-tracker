'use client'

import type { ReactNode } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface SeasonTabsProps {
  racesContent: ReactNode
  heatmapContent?: ReactNode
  driverStandingsContent: ReactNode
  constructorStandingsContent: ReactNode
}

export function SeasonTabs({
  racesContent,
  heatmapContent,
  driverStandingsContent,
  constructorStandingsContent,
}: SeasonTabsProps) {
  return (
    <Tabs defaultValue={0}>
      <TabsList variant="line">
        <TabsTrigger value={0}>Races</TabsTrigger>
        {heatmapContent !== undefined && <TabsTrigger value={1}>Heatmap</TabsTrigger>}
        <TabsTrigger value={2}>Driver Standings</TabsTrigger>
        <TabsTrigger value={3}>Constructor Standings</TabsTrigger>
      </TabsList>
      <TabsContent value={0}>{racesContent}</TabsContent>
      {heatmapContent !== undefined && <TabsContent value={1}>{heatmapContent}</TabsContent>}
      <TabsContent value={2}>{driverStandingsContent}</TabsContent>
      <TabsContent value={3}>{constructorStandingsContent}</TabsContent>
    </Tabs>
  )
}
