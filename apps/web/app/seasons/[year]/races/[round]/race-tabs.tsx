'use client'

import type { ReactNode } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface RaceTabsProps {
  raceResultsContent: ReactNode
  qualifyingContent: ReactNode
  sprintContent?: ReactNode
  pitStopsContent?: ReactNode
}

export function RaceTabs({
  raceResultsContent,
  qualifyingContent,
  sprintContent,
  pitStopsContent,
}: RaceTabsProps) {
  return (
    <Tabs defaultValue={0}>
      <TabsList variant="line">
        <TabsTrigger value={0}>Race Results</TabsTrigger>
        <TabsTrigger value={1}>Qualifying</TabsTrigger>
        {sprintContent !== undefined && <TabsTrigger value={2}>Sprint</TabsTrigger>}
        {pitStopsContent !== undefined && <TabsTrigger value={3}>Pit Stops</TabsTrigger>}
      </TabsList>
      <TabsContent value={0}>{raceResultsContent}</TabsContent>
      <TabsContent value={1}>{qualifyingContent}</TabsContent>
      {sprintContent !== undefined && <TabsContent value={2}>{sprintContent}</TabsContent>}
      {pitStopsContent !== undefined && <TabsContent value={3}>{pitStopsContent}</TabsContent>}
    </Tabs>
  )
}
