'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { TrackOutline } from '@/components/circuits/track-outline'
import type { CircuitLayout } from '@/lib/types'

interface TrackLayoutProps {
  layouts: CircuitLayout[]
  name?: string
  className?: string
}

export function TrackLayout({ layouts, name, className }: TrackLayoutProps) {
  // Default to the most recent layout (highest number)
  const [selectedIdx, setSelectedIdx] = useState(layouts.length - 1)

  if (layouts.length === 0) return null

  const current = layouts[selectedIdx]

  return (
    <div className={cn('brackets bg-surface-1 border-hairline border', className)}>
      {/* Layout selector (only show if multiple variants) */}
      {layouts.length > 1 && (
        <div className="border-hairline flex flex-wrap gap-2 border-b px-4 py-3">
          {layouts.map((layout, idx) => (
            <button
              key={layout.svgId}
              onClick={() => setSelectedIdx(idx)}
              aria-pressed={idx === selectedIdx}
              className={cn(
                'font-data focus-ring px-3 py-1.5 text-xs font-semibold transition-colors',
                idx === selectedIdx
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
              )}
            >
              {layout.seasonsActive}
            </button>
          ))}
        </div>
      )}

      {/* The layout drawn in the page accent (an SVG mask, see TrackOutline). */}
      <div className="p-8">
        <TrackOutline
          svgId={current.svgId}
          name={name ? `Track layout of ${name}` : 'Track'}
          className="mx-auto h-72 w-full max-w-xl md:h-96"
        />
      </div>
    </div>
  )
}
