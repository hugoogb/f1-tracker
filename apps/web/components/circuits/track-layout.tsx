'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'

interface TrackLayoutProps {
  coordinates: [number, number][]
  name?: string
  className?: string
}

function toMercatorY(lat: number): number {
  const rad = (lat * Math.PI) / 180
  return Math.log(Math.tan(Math.PI / 4 + rad / 2))
}

export function TrackLayout({ coordinates, name, className }: TrackLayoutProps) {
  const { points, viewBox } = useMemo(() => {
    if (coordinates.length === 0) return { points: '', viewBox: '0 0 100 100' }

    // Convert [lng, lat] to [x, y] using mercator projection
    const projected = coordinates.map(([lng, lat]) => ({
      x: lng,
      y: -toMercatorY(lat), // Negate so north is up
    }))

    // Find bounds
    const xs = projected.map((p) => p.x)
    const ys = projected.map((p) => p.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)

    const rangeX = maxX - minX || 1
    const rangeY = maxY - minY || 1

    // Scale to viewBox with padding
    const padding = 40
    const width = 800
    const height = 600
    const innerW = width - padding * 2
    const innerH = height - padding * 2

    // Maintain aspect ratio
    const scaleX = innerW / rangeX
    const scaleY = innerH / rangeY
    const scale = Math.min(scaleX, scaleY)

    const offsetX = padding + (innerW - rangeX * scale) / 2
    const offsetY = padding + (innerH - rangeY * scale) / 2

    const scaled = projected.map((p) => ({
      x: offsetX + (p.x - minX) * scale,
      y: offsetY + (p.y - minY) * scale,
    }))

    const pointStr = scaled.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

    return { points: pointStr, viewBox: `0 0 ${width} ${height}` }
  }, [coordinates])

  if (coordinates.length === 0) return null

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-[var(--glass-border)] bg-[var(--surface-1)]',
        className,
      )}
    >
      <svg
        viewBox={viewBox}
        className="h-auto w-full"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={name ? `Track layout of ${name}` : 'Track layout'}
      >
        <defs>
          <filter id="track-glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Track outline glow layer */}
        <polyline
          points={points}
          fill="none"
          stroke="oklch(0.55 0.25 27 / 30%)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#track-glow)"
        />

        {/* Main track line */}
        <polyline
          points={points}
          fill="none"
          stroke="#E10600"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Start/finish marker */}
        {points &&
          (() => {
            const first = points.split(' ')[0]?.split(',')
            if (!first || first.length < 2) return null
            const cx = parseFloat(first[0])
            const cy = parseFloat(first[1])
            return <circle cx={cx} cy={cy} r="6" fill="#ffffff" stroke="#E10600" strokeWidth="2" />
          })()}
      </svg>
    </div>
  )
}
