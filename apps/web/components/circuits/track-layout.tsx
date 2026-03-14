'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
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
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-[var(--glass-border)] bg-[var(--surface-1)]',
        className,
      )}
    >
      {/* Layout selector (only show if multiple variants) */}
      {layouts.length > 1 && (
        <div className="flex flex-wrap gap-2 border-b border-[var(--glass-border)] px-4 py-3">
          {layouts.map((layout, idx) => (
            <button
              key={layout.svgId}
              onClick={() => setSelectedIdx(idx)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                idx === selectedIdx
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {layout.seasonsActive}
            </button>
          ))}
        </div>
      )}

      {/* Track SVG — plain <img> since SVGs don't benefit from next/image optimization */}
      <div className="flex items-center justify-center p-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/tracks/${current.svgId}.svg`}
          alt={name ? `Track layout of ${name}` : 'Track layout'}
          width={500}
          height={500}
          className="h-auto max-h-[400px] w-auto max-w-full"
          loading="lazy"
        />
      </div>
    </div>
  )
}
