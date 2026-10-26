'use client'

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'

import { TooltipFrame, TooltipRow } from '@/components/charts/chart-tooltip'
import { axisProps, gridProps, REFERENCE } from '@/lib/chart-theme'
import { densityAt, niceTicks, type ViolinColumn, type ViolinDot } from '@/lib/violin'

export interface ViolinChartProps<C extends ViolinColumn = ViolinColumn> {
  columns: C[]
  /** Formats y values for the axis and the default tooltip. */
  formatValue: (value: number) => string
  /** Rendered under each column. */
  renderFooter?: (column: C) => ReactNode
  renderTooltip?: (hit: { column: C; dot?: ViolinDot }) => ReactNode
  /** Dashed line through the medians, in column order. */
  connectMedians?: boolean
  /** Plot height in px. */
  height?: number
  /** Below this the chart scrolls horizontally rather than squeezing columns. */
  minColumnWidth?: number
  ariaLabel: string
}

const GUTTER = 64
const PAD_Y = 12
const DOT_RADIUS = 2.5
const DIAMOND = 6

interface Hover {
  column: number
  dot?: number
  x: number
  y: number
  /** Past the middle of the frame the tooltip opens to the left of the pointer. */
  flip: boolean
}

/**
 * Violins with a swarm of dots: one column per entity, an outline from the
 * column's density, a diamond at the median. Smaller values sit lower, so on
 * a lap-time axis the faster laps are at the bottom.
 *
 * Plain SVG — Recharts has no violin — styled from the same chart theme. The
 * y-axis stays put in a gutter while the columns scroll on a narrow screen.
 */
export function ViolinChart<C extends ViolinColumn>({
  columns,
  formatValue,
  renderFooter,
  renderTooltip,
  connectMedians = true,
  height = 420,
  minColumnWidth = 44,
  ariaLabel,
}: ViolinChartProps<C>) {
  const frameRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [available, setAvailable] = useState(0)
  const [hover, setHover] = useState<Hover | null>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setAvailable(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  if (columns.length === 0) return null

  const width = Math.max(available, columns.length * minColumnWidth)
  const columnWidth = width / columns.length
  const centre = (i: number) => (i + 0.5) * columnWidth

  const lo = Math.min(...columns.map((c) => c.density[0]?.y ?? c.median))
  const hi = Math.max(...columns.map((c) => c.density[c.density.length - 1]?.y ?? c.median))
  const span = hi - lo || 1
  const plot = height - 2 * PAD_Y
  const toPx = (value: number) => PAD_Y + ((hi - value) / span) * plot
  const ticks = niceTicks(lo, hi, 8)

  function outline(column: C, i: number): string {
    const half = 0.45 * columnWidth
    const right = column.density.map((p) => `${centre(i) + p.w * half},${toPx(p.y)}`)
    const left = [...column.density].reverse().map((p) => `${centre(i) - p.w * half},${toPx(p.y)}`)
    return `M${[...right, ...left].join('L')}Z`
  }

  function point(event: PointerEvent, column: number, dot?: number) {
    const frame = frameRef.current?.getBoundingClientRect()
    if (!frame) return
    const x = event.clientX - frame.left
    setHover({ column, dot, x, y: event.clientY - frame.top, flip: x > frame.width / 2 })
  }

  const hovered = hover ? columns[hover.column] : null
  const hoveredDot = hovered && hover?.dot !== undefined ? hovered.dots?.[hover.dot] : undefined

  return (
    <div ref={frameRef} className="relative" onPointerLeave={() => setHover(null)}>
      <div className="flex">
        <svg width={GUTTER} height={height} className="shrink-0" aria-hidden>
          {ticks.map((tick) => (
            <text
              key={tick}
              x={GUTTER - 8}
              y={toPx(tick)}
              textAnchor="end"
              dominantBaseline="middle"
              {...axisProps.tick}
            >
              {formatValue(tick)}
            </text>
          ))}
        </svg>
        <div ref={scrollRef} className="min-w-0 flex-1 overflow-x-auto">
          <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block">
            {ticks.map((tick) => (
              <line
                key={tick}
                x1={0}
                x2={width}
                y1={toPx(tick)}
                y2={toPx(tick)}
                stroke={gridProps.stroke}
                strokeDasharray={gridProps.strokeDasharray}
              />
            ))}
            {columns.map((column, i) => (
              <g key={column.key}>
                <rect
                  x={i * columnWidth}
                  y={0}
                  width={columnWidth}
                  height={height}
                  fill="transparent"
                  onPointerMove={(e) => point(e, i)}
                />
                <path
                  d={outline(column, i)}
                  fill={`color-mix(in oklab, ${column.color} 18%, transparent)`}
                  stroke={column.color}
                  strokeWidth={1}
                  pointerEvents="none"
                />
                {column.dots?.map((dot, j) => (
                  <circle
                    key={j}
                    cx={centre(i) + dot.x * densityAt(column.density, dot.y) * 0.4 * columnWidth}
                    cy={toPx(dot.y)}
                    r={hover?.column === i && hover.dot === j ? DOT_RADIUS * 1.8 : DOT_RADIUS}
                    fill={dot.color}
                    onPointerMove={(e) => {
                      e.stopPropagation()
                      point(e, i, j)
                    }}
                  />
                ))}
              </g>
            ))}
            {connectMedians && columns.length > 1 && (
              <polyline
                points={columns.map((c, i) => `${centre(i)},${toPx(c.median)}`).join(' ')}
                fill="none"
                stroke={REFERENCE}
                strokeDasharray="4 4"
                pointerEvents="none"
              />
            )}
            {columns.map((column, i) => {
              const x = centre(i)
              const y = toPx(column.median)
              return (
                <polygon
                  key={column.key}
                  points={`${x},${y - DIAMOND} ${x + DIAMOND},${y} ${x},${y + DIAMOND} ${x - DIAMOND},${y}`}
                  fill="var(--foreground)"
                  stroke="var(--background)"
                  strokeWidth={1}
                  pointerEvents="none"
                />
              )
            })}
          </svg>
          {renderFooter && (
            <div className="flex pt-3" style={{ width }}>
              {columns.map((column) => (
                <div
                  key={column.key}
                  className="flex flex-col items-center gap-1 text-center"
                  style={{ width: columnWidth }}
                >
                  {renderFooter(column)}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {hover && hovered && (
        <div
          className="pointer-events-none absolute z-10"
          style={{
            left: hover.x + 12,
            top: hover.y + 12,
            transform: hover.flip ? 'translateX(-110%)' : undefined,
          }}
        >
          {renderTooltip ? (
            renderTooltip({ column: hovered, dot: hoveredDot })
          ) : (
            <TooltipFrame title={hovered.label}>
              <TooltipRow name="Median" value={formatValue(hovered.median)} />
              <TooltipRow
                name="IQR"
                value={`${formatValue(hovered.q1)} – ${formatValue(hovered.q3)}`}
              />
            </TooltipFrame>
          )}
        </div>
      )}
    </div>
  )
}
