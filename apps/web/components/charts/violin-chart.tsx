'use client'

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'

import { TooltipFrame, TooltipRow } from '@/components/charts/chart-tooltip'
import { axisProps, gridProps, REFERENCE } from '@/lib/chart-theme'
import {
  densityAt,
  niceTicks,
  outlinePath,
  violinDomain,
  type ViolinColumn,
  type ViolinDot,
} from '@/lib/violin'

export interface ViolinChartProps<C extends ViolinColumn = ViolinColumn> {
  columns: C[]
  formatValue: (value: number) => string
  renderFooter?: (column: C) => ReactNode
  renderTooltip?: (hit: { column: C; dot?: ViolinDot }) => ReactNode
  describeColumn?: (column: C) => string
  connectMedians?: boolean
  height?: number
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
  flip: boolean
  focus?: boolean
}

function hitAt(target: EventTarget): { column: number; dot?: number } | null {
  const el = target instanceof Element ? target.closest('[data-col]') : null
  if (!el) return null
  const dot = el.getAttribute('data-dot')
  return {
    column: Number(el.getAttribute('data-col')),
    dot: dot === null ? undefined : Number(dot),
  }
}

export function ViolinChart<C extends ViolinColumn>({
  columns,
  formatValue,
  renderFooter,
  renderTooltip,
  describeColumn,
  connectMedians = true,
  height = 420,
  minColumnWidth = 44,
  ariaLabel,
}: ViolinChartProps<C>) {
  const frameRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [available, setAvailable] = useState(0)
  const [hover, setHover] = useState<Hover | null>(null)

  const empty = columns.length === 0
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    setAvailable(el.clientWidth)
    const observer = new ResizeObserver(([entry]) => setAvailable(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [empty])

  const open = hover !== null
  useEffect(() => {
    if (!open) return
    const close = (event: globalThis.PointerEvent) => {
      if (!frameRef.current?.contains(event.target as Node)) setHover(null)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  const geometry = useMemo(() => {
    const domain = violinDomain(columns)
    if (!domain) return null
    const width = Math.max(available, columns.length * minColumnWidth)
    const columnWidth = width / columns.length
    const span = domain.hi - domain.lo || 1
    const plot = height - 2 * PAD_Y
    return {
      width,
      columnWidth,
      ticks: niceTicks(domain.lo, domain.hi, 8),
      centre: (i: number) => (i + 0.5) * columnWidth,
      toPx: (value: number) => PAD_Y + ((domain.hi - value) / span) * plot,
    }
  }, [columns, available, height, minColumnWidth])

  const describe = useMemo(
    () =>
      describeColumn ??
      ((c: C) =>
        `${c.label}: median ${formatValue(c.median)}, middle half ${formatValue(c.q1)} to ${formatValue(c.q3)}`),
    [describeColumn, formatValue],
  )

  const plot = useMemo(() => {
    if (!geometry) return null
    const { width, columnWidth, ticks, centre, toPx } = geometry
    const drawn = columns.flatMap((c, i) => (c.density.length > 0 ? [{ c, i }] : []))
    return (
      <>
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
              data-col={i}
              x={i * columnWidth}
              y={0}
              width={columnWidth}
              height={height}
              fill="transparent"
              tabIndex={0}
              role="img"
              aria-label={describe(column)}
              className="outline-none"
            />
            {column.density.length > 0 && (
              <>
                <path
                  d={outlinePath(column.density, centre(i), 0.45 * columnWidth, toPx)}
                  fill={`color-mix(in oklab, ${column.color} 18%, transparent)`}
                  stroke={column.color}
                  strokeWidth={1}
                  pointerEvents="none"
                />
                {column.dots?.map((dot, j) => (
                  <circle
                    key={j}
                    data-col={i}
                    data-dot={j}
                    cx={centre(i) + dot.x * densityAt(column.density, dot.y) * 0.4 * columnWidth}
                    cy={toPx(dot.y)}
                    r={DOT_RADIUS}
                    fill={dot.color}
                  />
                ))}
              </>
            )}
          </g>
        ))}
        {connectMedians && drawn.length > 1 && (
          <polyline
            points={drawn.map(({ c, i }) => `${centre(i)},${toPx(c.median)}`).join(' ')}
            fill="none"
            stroke={REFERENCE}
            strokeDasharray="4 4"
            pointerEvents="none"
          />
        )}
        {drawn.map(({ c, i }) => {
          const x = centre(i)
          const y = toPx(c.median)
          return (
            <polygon
              key={c.key}
              points={`${x},${y - DIAMOND} ${x + DIAMOND},${y} ${x},${y + DIAMOND} ${x - DIAMOND},${y}`}
              fill="var(--foreground)"
              stroke="var(--background)"
              strokeWidth={1}
              pointerEvents="none"
            />
          )
        })}
      </>
    )
  }, [geometry, columns, connectMedians, height, describe])

  const footer = useMemo(
    () =>
      geometry &&
      renderFooter && (
        <div className="flex pt-3" style={{ width: geometry.width }}>
          {columns.map((column) => (
            <div
              key={column.key}
              className="flex flex-col items-center gap-1 text-center"
              style={{ width: geometry.columnWidth }}
            >
              {renderFooter(column)}
            </div>
          ))}
        </div>
      ),
    [geometry, columns, renderFooter],
  )

  if (!geometry) return null
  const { width, columnWidth, ticks, centre, toPx } = geometry

  function track(event: PointerEvent<HTMLDivElement>) {
    const hit = hitAt(event.target)
    if (!hit) {
      if (event.pointerType !== 'touch') setHover(null)
      return
    }
    const frame = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - frame.left
    setHover({ ...hit, x, y: event.clientY - frame.top, flip: x > frame.width / 2 })
  }

  function focus(event: FocusEvent<HTMLDivElement>) {
    const hit = hitAt(event.target)
    const frame = frameRef.current?.getBoundingClientRect()
    if (!hit || !frame || !(event.target instanceof Element)) return
    const target = event.target.getBoundingClientRect()
    const x = target.left - frame.left + target.width / 2
    const y = target.top - frame.top + toPx(columns[hit.column].median)
    setHover({ column: hit.column, x, y, flip: x > frame.width / 2, focus: true })
  }

  const hovered = hover ? columns[hover.column] : null
  const hoveredDot = hovered && hover?.dot !== undefined ? hovered.dots?.[hover.dot] : undefined

  return (
    <div
      ref={frameRef}
      className="relative"
      onPointerMove={track}
      onPointerDown={track}
      onPointerLeave={(e) => e.pointerType !== 'touch' && setHover(null)}
      onFocus={focus}
      onBlur={() => setHover((h) => (h?.focus ? null : h))}
    >
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
          <svg width={width} height={height} role="group" aria-label={ariaLabel} className="block">
            {plot}
            {hover?.focus && (
              <rect
                x={hover.column * columnWidth + 1}
                y={1}
                width={columnWidth - 2}
                height={height - 2}
                fill="none"
                stroke="var(--ring)"
                strokeWidth={1.5}
                pointerEvents="none"
              />
            )}
            {hoveredDot && hovered && (
              <circle
                cx={
                  centre(hover!.column) +
                  hoveredDot.x * densityAt(hovered.density, hoveredDot.y) * 0.4 * columnWidth
                }
                cy={toPx(hoveredDot.y)}
                r={DOT_RADIUS * 1.8}
                fill={hoveredDot.color}
                stroke="var(--foreground)"
                strokeWidth={1}
                pointerEvents="none"
              />
            )}
          </svg>
          {footer}
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
