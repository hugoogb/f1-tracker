'use client'

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

const WorldMap = dynamic(() => import('./world-map').then((mod) => mod.WorldMap), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
})

interface CircuitPin {
  ref: string
  name: string
  country: string | null
  latitude: number
  longitude: number
}

interface WorldMapWrapperProps {
  circuits: CircuitPin[]
}

export function WorldMapWrapper({ circuits }: WorldMapWrapperProps) {
  return (
    <div className="brackets border-hairline h-[400px] w-full border md:h-[500px]">
      <WorldMap circuits={circuits} />
    </div>
  )
}
