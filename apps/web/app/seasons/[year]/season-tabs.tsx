'use client'

import type { ReactNode } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface SeasonTabsProps {
  racesContent: ReactNode
  driverStandingsContent: ReactNode
  constructorStandingsContent: ReactNode
}

export function SeasonTabs({
  racesContent,
  driverStandingsContent,
  constructorStandingsContent,
}: SeasonTabsProps) {
  return (
    <Tabs defaultValue={0}>
      <TabsList variant="line">
        <TabsTrigger value={0}>Races</TabsTrigger>
        <TabsTrigger value={1}>Driver Standings</TabsTrigger>
        <TabsTrigger value={2}>Constructor Standings</TabsTrigger>
      </TabsList>
      <TabsContent value={0}>{racesContent}</TabsContent>
      <TabsContent value={1}>{driverStandingsContent}</TabsContent>
      <TabsContent value={2}>{constructorStandingsContent}</TabsContent>
    </Tabs>
  )
}
