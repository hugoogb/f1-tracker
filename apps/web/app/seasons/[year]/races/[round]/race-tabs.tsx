'use client'

import type { ReactNode } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface RaceTabsProps {
  raceResultsContent: ReactNode
  qualifyingContent: ReactNode
  sprintContent?: ReactNode
  pitStopsContent?: ReactNode
  lapsContent?: ReactNode
  paceContent?: ReactNode
}

export function RaceTabs({
  raceResultsContent,
  qualifyingContent,
  sprintContent,
  pitStopsContent,
  lapsContent,
  paceContent,
}: RaceTabsProps) {
  return (
    <Tabs defaultValue={0}>
      <TabsList variant="line">
        <TabsTrigger value={0}>Race Results</TabsTrigger>
        <TabsTrigger value={1}>Qualifying</TabsTrigger>
        {sprintContent !== undefined && <TabsTrigger value={2}>Sprint</TabsTrigger>}
        {pitStopsContent !== undefined && <TabsTrigger value={3}>Pit Stops</TabsTrigger>}
        {lapsContent !== undefined && <TabsTrigger value={4}>Lap Times</TabsTrigger>}
        {paceContent !== undefined && <TabsTrigger value={5}>Pace</TabsTrigger>}
      </TabsList>
      <TabsContent value={0}>{raceResultsContent}</TabsContent>
      <TabsContent value={1}>{qualifyingContent}</TabsContent>
      {sprintContent !== undefined && <TabsContent value={2}>{sprintContent}</TabsContent>}
      {pitStopsContent !== undefined && <TabsContent value={3}>{pitStopsContent}</TabsContent>}
      {lapsContent !== undefined && <TabsContent value={4}>{lapsContent}</TabsContent>}
      {paceContent !== undefined && <TabsContent value={5}>{paceContent}</TabsContent>}
    </Tabs>
  )
}
