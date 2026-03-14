'use client'

import type { ReactNode } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface ChampionsTabsProps {
  driversContent: ReactNode
  constructorsContent: ReactNode
}

export function ChampionsTabs({ driversContent, constructorsContent }: ChampionsTabsProps) {
  return (
    <Tabs defaultValue={0}>
      <TabsList variant="line">
        <TabsTrigger value={0}>Drivers</TabsTrigger>
        <TabsTrigger value={1}>Constructors</TabsTrigger>
      </TabsList>
      <TabsContent value={0}>{driversContent}</TabsContent>
      <TabsContent value={1}>{constructorsContent}</TabsContent>
    </Tabs>
  )
}
