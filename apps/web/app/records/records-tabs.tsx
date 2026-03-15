'use client'

import type { ReactNode } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface RecordsTabsProps {
  driversContent: ReactNode
  constructorsContent: ReactNode
}

export function RecordsTabs({ driversContent, constructorsContent }: RecordsTabsProps) {
  return (
    <Tabs defaultValue={0}>
      <TabsList variant="line">
        <TabsTrigger value={0}>Driver Records</TabsTrigger>
        <TabsTrigger value={1}>Constructor Records</TabsTrigger>
      </TabsList>
      <TabsContent value={0}>{driversContent}</TabsContent>
      <TabsContent value={1}>{constructorsContent}</TabsContent>
    </Tabs>
  )
}
