'use client'

import type { ReactNode } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface TitlePermutationsTabsProps {
  driversContent: ReactNode
  constructorsContent: ReactNode
}

/** Switches the permutations panel between the two championships. */
export function TitlePermutationsTabs({
  driversContent,
  constructorsContent,
}: TitlePermutationsTabsProps) {
  return (
    <Tabs defaultValue="drivers">
      <TabsList variant="line">
        <TabsTrigger value="drivers">Drivers</TabsTrigger>
        <TabsTrigger value="constructors">Constructors</TabsTrigger>
      </TabsList>
      <TabsContent value="drivers">{driversContent}</TabsContent>
      <TabsContent value="constructors">{constructorsContent}</TabsContent>
    </Tabs>
  )
}
