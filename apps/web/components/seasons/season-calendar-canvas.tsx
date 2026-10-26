'use client'

import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import L from 'leaflet'
import { MapContainer, Marker, Tooltip, useMap } from 'react-leaflet'
import type { FeatureCollection, Position } from 'geojson'
import { Minus, Plus } from 'lucide-react'
import 'leaflet/dist/leaflet.css'
import { LocalDate } from '@/components/ui/local-date'
import { MAP_GRID, MAP_INK, MAP_LAND, MAP_NEUTRAL, MAP_RED, MAP_RED_HOT } from '@/lib/map-theme'
import type { CalendarCamera, CalendarLeg, CalendarStop, Playhead } from './season-calendar-model'
import {
  WORLD_PX,
  compactLongitudes,
  fitZoom,
  followZoom,
  headingAt,
  mercator,
  nearestCopy,
  pointAt,
  prefixAt,
  projectPath,
  smoothstep,
  unmercator,
  type Point,
  type ProjectedPath,
} from './season-calendar-projection'
import styles from './season-calendar-map.module.css'

// Landmass from bundled Natural Earth geometry (public domain), exactly as the
// circuits map draws it — never raster tiles, which would bring an attribution
// requirement and a non-commercial restriction with them.
const WORLD_GEOJSON_URL = '/geo/world.geo.json'

// One request per page view however many maps mount (home + season page, tab
// switches, Strict Mode's double effects).
let worldPromise: Promise<FeatureCollection | null> | null = null
function loadWorld(): Promise<FeatureCollection | null> {
  worldPromise ??= fetch(WORLD_GEOJSON_URL)
    .then((res) => (res.ok ? (res.json() as Promise<FeatureCollection>) : null))
    .catch(() => null)
  return worldPromise
}

/**
 * Everything but the markers is drawn on one canvas in its own pane, under the
 * marker pane (600). Leaflet's vector layers are deliberately not used: their
 * renderers only re-project on `moveend` and CSS-scale the last frame during a
 * flight, so a line updated mid-flight is projected twice — it drifts off the
 * glyph, swells, and the land visibly re-rasterises when the flight lands.
 * The canvas is redrawn from the live view on every `move` instead.
 */
const CANVAS_PANE = 'calendar-canvas'

const MARKER_SIZE = 24
const STOP_ZOOM = { compact: 3.5, wide: 4.25 }
const MIN_ZOOM = 0
const MAX_ZOOM = 9
/** Screen length of the white-hot head of the leg being flown. */
const COMET_PX = 90
/** Mercator explodes towards the poles; the overview frames latitudes up to here. */
const OVERVIEW_MAX_LAT = 80

interface SeasonCalendarCanvasProps {
  year: number
  stops: CalendarStop[]
  legs: (CalendarLeg | null)[]
  focus: number | null
  playhead: Playhead
  camera: CalendarCamera
  onSelect: (index: number) => void
}

export function SeasonCalendarCanvas({
  year,
  stops,
  legs,
  focus,
  playhead,
  camera,
  onSelect,
}: SeasonCalendarCanvasProps) {
  const [world, setWorld] = useState<FeatureCollection | null>(null)

  useEffect(() => {
    let cancelled = false
    loadWorld().then((data) => {
      if (!cancelled) setWorld(data)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Projected once per season; every frame after that is a scale and offset.
  const projected = useMemo(() => legs.map((leg) => (leg ? projectPath(leg.path) : null)), [legs])

  // On a touch screen a one-finger drag has to scroll the page, not pan the
  // map — two fingers still pan and pinch-zoom it.
  const touch = L.Browser.mobile

  return (
    <MapContainer
      center={[25, 10]}
      zoom={2}
      minZoom={MIN_ZOOM}
      maxZoom={MAX_ZOOM}
      // Fractional zooms everywhere: the chase camera moves continuously, and
      // snapping would step it in visible jumps.
      zoomSnap={0}
      zoomDelta={0.5}
      // Leaflet's CSS zoom animation would scale the markers but not the
      // canvas; zooms are flights instead (see ZoomButtons).
      zoomAnimation={false}
      scrollWheelZoom={false}
      dragging={!touch}
      touchZoom
      attributionControl={false}
      zoomControl={false}
      // The world repeats sideways (the canvas draws every visible copy and the
      // markers follow the copy in view), so only latitude is bounded.
      maxBounds={[
        [-80, -100_000],
        [86, 100_000],
      ]}
      maxBoundsViscosity={1}
      className={`${styles.map} h-full w-full`}
    >
      <CalendarLayer world={world} projected={projected} playhead={playhead} />
      <CameraController camera={camera} stops={stops} projected={projected} playhead={playhead} />
      <Markers year={year} stops={stops} focus={focus} onSelect={onSelect} />
      <ZoomButtons />
    </MapContainer>
  )
}

// ── Canvas ──────────────────────────────────────────────────────────────────

/** Land as one Path2D in zoom-0 world pixels. */
function landPath(world: FeatureCollection): Path2D {
  const path = new Path2D()
  const ring = (coords: Position[]) => {
    coords.forEach(([lng, lat], i) => {
      const [x, y] = mercator([lat, lng])
      if (i === 0) path.moveTo(x, y)
      else path.lineTo(x, y)
    })
    path.closePath()
  }
  for (const feature of world.features) {
    const geometry = feature.geometry
    if (geometry?.type === 'Polygon') geometry.coordinates.forEach(ring)
    else if (geometry?.type === 'MultiPolygon')
      geometry.coordinates.forEach((polygon) => polygon.forEach(ring))
  }
  return path
}

/** A faint 30° graticule: the blueprint grid the rest of the UI sits on. */
function graticulePath(): Path2D {
  const path = new Path2D()
  for (let lng = -180; lng < 180; lng += 30) {
    const [x] = mercator([0, lng])
    const [, top] = mercator([80, lng])
    const [, bottom] = mercator([-80, lng])
    path.moveTo(x, top)
    path.lineTo(x, bottom)
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const [, y] = mercator([lat, 0])
    path.moveTo(0, y)
    path.lineTo(WORLD_PX, y)
  }
  return path
}

interface View {
  /** Device pixels per world pixel. */
  scale: number
  /** Device-pixel position of world pixel (0, 0) on the canvas. */
  ox: number
  oy: number
  /** World copies (multiples of WORLD_PX) that can reach the viewport. */
  copies: number[]
  dpr: number
}

function strokeLine(ctx: CanvasRenderingContext2D, points: Point[], view: View, shift: number) {
  ctx.beginPath()
  points.forEach(([x, y], i) => {
    const sx = view.ox + (x + shift) * view.scale
    const sy = view.oy + y * view.scale
    if (i === 0) ctx.moveTo(sx, sy)
    else ctx.lineTo(sx, sy)
  })
  ctx.stroke()
}

/** The tail of a polyline, `length` screen pixels long, from its end. */
function tailOf(points: Point[], length: number, scale: number): Point[] {
  const out: Point[] = [points[points.length - 1]]
  let left = length / scale
  for (let i = points.length - 1; i > 0 && left > 0; i--) {
    const [x1, y1] = points[i]
    const [x0, y0] = points[i - 1]
    const d = Math.hypot(x1 - x0, y1 - y0)
    if (d >= left) {
      const t = left / d
      out.push([x1 + (x0 - x1) * t, y1 + (y0 - y1) * t])
      break
    }
    out.push(points[i - 1])
    left -= d
  }
  return out.reverse()
}

function CalendarLayer({
  world,
  projected,
  playhead,
}: {
  world: FeatureCollection | null
  projected: (ProjectedPath | null)[]
  playhead: Playhead
}) {
  const map = useMap()
  const land = useMemo(() => (world ? landPath(world) : null), [world])
  const grid = useMemo(() => graticulePath(), [])

  useEffect(() => {
    const pane = map.getPane(CANVAS_PANE) ?? map.createPane(CANVAS_PANE)
    pane.style.zIndex = '350'
    pane.style.pointerEvents = 'none'
    const canvas = L.DomUtil.create('canvas', '', pane)
    canvas.style.position = 'absolute'
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const draw = () => {
      const size = map.getSize()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = Math.round(size.x * dpr)
      const h = Math.round(size.y * dpr)
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
        canvas.style.width = `${size.x}px`
        canvas.style.height = `${size.y}px`
      }
      // Pin the canvas to the viewport: the pane itself moves while dragging.
      L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]))

      const zoomScale = 2 ** map.getZoom()
      const origin = map.layerPointToContainerPoint([0, 0]).subtract(map.getPixelOrigin())
      const scale = zoomScale * dpr
      const ox = origin.x * dpr
      const oy = origin.y * dpr
      const first = Math.floor(-ox / scale / WORLD_PX) - 1
      const last = Math.floor((w - ox) / scale / WORLD_PX) + 1
      const copies: number[] = []
      for (let k = first; k <= last; k++) copies.push(k * WORLD_PX)
      const view: View = { scale, ox, oy, copies, dpr }

      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, w, h)

      // Land and grid, in world pixels through the transform.
      for (const shift of copies) {
        ctx.setTransform(scale, 0, 0, scale, ox + shift * scale, oy)
        ctx.lineWidth = dpr / scale
        ctx.strokeStyle = MAP_GRID
        ctx.stroke(grid)
        if (land) {
          ctx.fillStyle = MAP_LAND.fillColor
          ctx.fill(land, 'evenodd')
          ctx.lineWidth = (MAP_LAND.weight * dpr) / scale
          ctx.strokeStyle = MAP_LAND.color
          ctx.stroke(land)
        }
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      const pos = playhead.get()
      const reached = Math.floor(pos)
      const frac = pos - reached

      // The season still to come: a faint dotted route.
      ctx.setLineDash([2 * dpr, 6 * dpr])
      ctx.strokeStyle = MAP_INK
      ctx.globalAlpha = 0.28
      ctx.lineWidth = 1.3 * dpr
      projected.forEach((leg, i) => {
        if (!leg || i <= reached) return
        for (const shift of copies) strokeLine(ctx, leg.points, view, shift)
      })
      ctx.setLineDash([])

      // Legs already flown: a soft glow under a hot core.
      const flown = projected.filter((leg, i): leg is ProjectedPath => !!leg && i <= reached)
      ctx.strokeStyle = MAP_RED
      ctx.globalAlpha = 0.22
      ctx.lineWidth = 6 * dpr
      for (const leg of flown) for (const shift of copies) strokeLine(ctx, leg.points, view, shift)
      ctx.strokeStyle = MAP_RED_HOT
      ctx.globalAlpha = 0.9
      ctx.lineWidth = 1.8 * dpr
      for (const leg of flown) for (const shift of copies) strokeLine(ctx, leg.points, view, shift)
      ctx.globalAlpha = 1

      // The leg being flown, its white-hot head, and the glyph at the tip.
      const active = frac > 1e-4 ? projected[reached + 1] : null
      if (active) {
        const trail = prefixAt(active, frac)
        const head = tailOf(trail, COMET_PX * dpr, scale)
        const tip = pointAt(active, frac)
        const heading = headingAt(active, frac)
        for (const shift of copies) {
          ctx.strokeStyle = MAP_RED
          ctx.globalAlpha = 0.35
          ctx.lineWidth = 9 * dpr
          strokeLine(ctx, trail, view, shift)
          ctx.globalAlpha = 1
          ctx.strokeStyle = MAP_RED_HOT
          ctx.lineWidth = 2.2 * dpr
          strokeLine(ctx, trail, view, shift)

          const [tx, ty] = head[0]
          const [hx, hy] = head[head.length - 1]
          const gradient = ctx.createLinearGradient(
            view.ox + (tx + shift) * scale,
            view.oy + ty * scale,
            view.ox + (hx + shift) * scale,
            view.oy + hy * scale,
          )
          gradient.addColorStop(0, 'rgba(255, 255, 255, 0)')
          gradient.addColorStop(1, MAP_INK)
          ctx.strokeStyle = gradient
          ctx.lineWidth = 2.6 * dpr
          strokeLine(ctx, head, view, shift)

          drawGlyph(ctx, view.ox + (tip[0] + shift) * scale, view.oy + tip[1] * scale, heading, dpr)
        }
      }
    }

    // Synchronous on `move`: a flight frame and the markers it moves must land
    // in the same paint, or the lines trail the pins by a frame.
    map.on('move resize viewreset', draw)
    const unsubscribe = playhead.subscribe(draw)
    draw()
    return () => {
      map.off('move resize viewreset', draw)
      unsubscribe()
      canvas.remove()
    }
  }, [map, land, grid, projected, playhead])

  return null
}

/** A navigation arrow with a pulsing halo, rotated to the leg's heading. */
function drawGlyph(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  heading: number | null,
  dpr: number,
) {
  const pulse = 0.85 + 0.15 * Math.sin(performance.now() / 220)
  const r = 20 * dpr * pulse
  const halo = ctx.createRadialGradient(x, y, 0, x, y, r)
  halo.addColorStop(0, 'rgba(255, 59, 47, 0.75)')
  halo.addColorStop(1, 'rgba(255, 59, 47, 0)')
  ctx.fillStyle = halo
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()

  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(heading ?? 0)
  ctx.scale(dpr * 0.9, dpr * 0.9)
  ctx.translate(-12, -12)
  ctx.beginPath()
  ctx.moveTo(12, 2)
  ctx.lineTo(20, 21)
  ctx.lineTo(12, 16.5)
  ctx.lineTo(4, 21)
  ctx.closePath()
  ctx.shadowColor = MAP_RED_HOT
  ctx.shadowBlur = 8 * dpr
  ctx.fillStyle = MAP_INK
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.lineWidth = 1.6
  ctx.strokeStyle = MAP_RED
  ctx.stroke()
  ctx.restore()
}

// ── Camera ──────────────────────────────────────────────────────────────────

function stopZoom(map: L.Map): number {
  return map.getSize().x < 640 ? STOP_ZOOM.compact : STOP_ZOOM.wide
}

function padding(map: L.Map): number {
  return map.getSize().x < 640 ? 28 : 60
}

/** A world-pixel point, as a LatLng on the copy nearest the current view. */
function toLatLng(point: Point): L.LatLng {
  const [lat, lng] = unmercator(point)
  return L.latLng(lat, lng)
}

interface Follow {
  path: ProjectedPath
  /** World copy the leg is flown on, so the camera never jumps a world width. */
  shift: number
  stopZoom: number
  legZoom: number
  /** The view when the leg started, eased out over the first stretch. */
  from: { center: Point; zoom: number; s: number }
  to: number
}

/**
 * Executes camera commands: each new `nonce` is one flight (or one jump).
 *
 * A `leg` command does not fly anywhere by itself: it hands the camera to the
 * playhead, which then chases the glyph every frame — pulling back to frame the
 * whole leg mid-flight and settling on the destination as it lands. A Leaflet
 * flight runs on its own clock and easing, and would lose the glyph off-screen.
 */
function CameraController({
  camera,
  stops,
  projected,
  playhead,
}: {
  camera: CalendarCamera
  stops: CalendarStop[]
  projected: (ProjectedPath | null)[]
  playhead: Playhead
}) {
  const map = useMap()
  // Positions only — statuses change by the minute and must not re-fire a flight.
  const positions = useMemo(() => stops.map((s) => s.latLng), [stops])
  const follow = useRef<Follow | null>(null)

  useEffect(() => {
    const animate = camera.animate
    const size = map.getSize()
    const pad = padding(map)
    const centerLng = map.getCenter().lng
    follow.current = null

    if (camera.kind === 'overview') {
      if (positions.length === 0) return
      map.stop()
      const lngs = compactLongitudes(positions.map(([, lng]) => lng))
      // Frame the arcs' latitudes too, so a polar leg is not cut off the top.
      const lats = projected.flatMap((leg) => (leg ? leg.points.map((p) => unmercator(p)[0]) : []))
      lats.push(...positions.map(([lat]) => lat))
      const south = Math.max(-OVERVIEW_MAX_LAT, Math.min(...lats))
      const north = Math.min(OVERVIEW_MAX_LAT, Math.max(...lats))
      const west = Math.min(...lngs)
      const east = Math.max(...lngs)
      const mid = (west + east) / 2
      const shift = nearestCopy(mid, centerLng) - mid
      const bounds = L.latLngBounds([south, west + shift], [north, east + shift])
      const options = { padding: L.point(pad, pad), maxZoom: 5 }
      if (animate) map.flyToBounds(bounds, { ...options, duration: 1.4 })
      else map.fitBounds(bounds, { ...options, animate: false })
      return
    }

    if (camera.kind === 'stop') {
      const target = positions[camera.index]
      if (!target) return
      const zoom = camera.zoom ?? stopZoom(map)
      const latLng = L.latLng(target[0], nearestCopy(target[1], centerLng))
      // Already there (a chased leg lands exactly on its stop): a flight to
      // the same view would only restart the clock and stutter.
      const offset = map.latLngToContainerPoint(latLng).distanceTo(L.point(size.x / 2, size.y / 2))
      if (offset < 2 && Math.abs(map.getZoom() - zoom) < 0.05) return
      map.stop()
      if (animate) {
        map.flyTo(latLng, zoom, { duration: (camera.ms ?? 1200) / 1000, easeLinearity: 0.2 })
      } else {
        map.setView(latLng, zoom, { animate: false })
      }
      return
    }

    // A leg: chase the glyph.
    const path = projected[camera.to]
    if (!path || !animate) return
    map.stop()
    const startLng = unmercator(path.points[0])[1]
    const shift = ((nearestCopy(startLng, centerLng) - startLng) / 360) * WORLD_PX
    // Frame the whole leg around its midpoint, where the camera will be.
    const [mx, my] = pointAt(path, 0.5)
    let dx = 0
    let dy = 0
    for (const [x, y] of path.points) {
      dx = Math.max(dx, Math.abs(x - mx))
      dy = Math.max(dy, Math.abs(y - my))
    }
    const zStop = stopZoom(map)
    const legZoom = Math.max(
      MIN_ZOOM,
      Math.min(zStop, fitZoom(2 * dx, 2 * dy, size.x, size.y, pad)),
    )
    const here = map.project(map.getCenter(), 0)
    const pos = playhead.get()
    follow.current = {
      path,
      shift,
      stopZoom: zStop,
      legZoom,
      from: { center: [here.x, here.y], zoom: map.getZoom(), s: pos - Math.floor(pos) },
      to: camera.to,
    }
    // `camera` is the command; positions/legs are stable for a given season.
  }, [camera, map, positions, projected, playhead])

  useEffect(() => {
    const chase = () => {
      const f = follow.current
      if (!f) return
      const pos = playhead.get()
      const from = Math.floor(pos)
      if (from === f.to && pos === from) {
        // Landed: settle exactly on the stop, so the arrival command finds the
        // camera already there and has nothing to fly.
        follow.current = null
        const [x, y] = f.path.points[f.path.points.length - 1]
        map.setView(toLatLng([x + f.shift, y]), f.stopZoom, { reset: true } as L.ZoomPanOptions)
        return
      }
      // Moved off this leg (a seek): the stop command takes over.
      if (from + 1 !== f.to) {
        follow.current = null
        return
      }
      const s = pos - from
      const [gx, gy] = pointAt(f.path, s)
      const target: Point = [gx + f.shift, gy]
      const zoom = followZoom(s, f.stopZoom, f.legZoom)
      // Ease out of wherever the camera was (a dwell zoom, a user's pan) over
      // the first stretch of the leg, so the hand-over never jumps.
      const blend = smoothstep((s - f.from.s) / Math.max(0.25 * (1 - f.from.s), 1e-3))
      const center: Point = [
        f.from.center[0] + (target[0] - f.from.center[0]) * blend,
        f.from.center[1] + (target[1] - f.from.center[1]) * blend,
      ]
      const z = f.from.zoom + (zoom - f.from.zoom) * blend
      // `reset` skips Leaflet's pan path, which truncates to whole pixels and
      // would make a slow chase shimmer.
      map.setView(toLatLng(center), z, { reset: true } as L.ZoomPanOptions)
    }
    return playhead.subscribe(chase)
  }, [map, playhead])

  return null
}

/** Zoom buttons that fly, since the map's CSS zoom animation is off. */
function ZoomButtons() {
  const map = useMap()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    L.DomEvent.disableClickPropagation(ref.current)
  }, [])

  const zoomBy = (delta: number) => {
    const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, map.getZoom() + delta))
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    map.stop()
    if (reduce) map.setZoom(zoom)
    else map.flyTo(map.getCenter(), zoom, { duration: 0.35 })
  }

  const button =
    'focus-ring bg-surface-1 text-foreground hover:bg-surface-2 flex size-8 items-center justify-center transition-colors'
  return (
    <div
      ref={ref}
      className="border-hairline-strong divide-hairline-strong absolute right-3 bottom-3 z-[1000] flex flex-col divide-y border"
    >
      <button type="button" className={button} onClick={() => zoomBy(0.75)} aria-label="Zoom in">
        <Plus className="h-4 w-4" />
      </button>
      <button type="button" className={button} onClick={() => zoomBy(-0.75)} aria-label="Zoom out">
        <Minus className="h-4 w-4" />
      </button>
    </div>
  )
}

// ── Markers ─────────────────────────────────────────────────────────────────

const Markers = memo(function Markers({
  year,
  stops,
  focus,
  onSelect,
}: {
  year: number
  stops: CalendarStop[]
  focus: number | null
  onSelect: (index: number) => void
}) {
  return (
    <>
      {stops.map((stop) => (
        <StopMarker
          key={stop.round.round}
          year={year}
          stop={stop}
          focused={stop.index === focus}
          onSelect={onSelect}
        />
      ))}
    </>
  )
})

const STATUS_LABEL: Record<CalendarStop['status'], string> = {
  completed: 'completed',
  previous: 'last race',
  next: 'next race',
  future: 'upcoming',
  unknown: '',
}

function StopMarker({
  year,
  stop,
  focused,
  onSelect,
}: {
  year: number
  stop: CalendarStop
  focused: boolean
  onSelect: (index: number) => void
}) {
  const router = useRouter()
  const map = useMap()
  const ref = useRef<L.Marker>(null)
  const { round, status } = stop

  // DivIcon reuses its element when the icon changes, so keyboard focus and the
  // aria-label survive a status or focus change.
  const icon = useMemo(
    () =>
      L.divIcon({
        className: styles.markerWrap,
        iconSize: [MARKER_SIZE, MARKER_SIZE],
        iconAnchor: [MARKER_SIZE / 2, MARKER_SIZE / 2],
        html: `<span class="${styles.marker} ${styles[status]} ${focused ? styles.focused : ''}">${round.round}</span>`,
      }),
    [round.round, status, focused],
  )

  const label = [
    `Round ${round.round}: ${round.name}`,
    STATUS_LABEL[status],
    round.winner ? `won by ${round.winner.driver.firstName} ${round.winner.driver.lastName}` : '',
  ]
    .filter(Boolean)
    .join(', ')

  useEffect(() => {
    ref.current?.getElement()?.setAttribute('aria-label', label)
  }, [label, icon])

  // The world repeats sideways; keep the pin on the copy in view, so a camera
  // over the Pacific still shows both ends of the leg it is flying.
  useEffect(() => {
    const [lat, lng] = stop.latLng
    let shown = lng
    const place = () => {
      const next = nearestCopy(lng, map.getCenter().lng)
      if (next === shown) return
      shown = next
      ref.current?.setLatLng([lat, next])
    }
    place()
    map.on('move', place)
    return () => {
      map.off('move', place)
    }
  }, [map, stop.latLng])

  const raced = round.winner !== null || status === 'completed' || status === 'previous'

  const zIndexOffset = focused
    ? 1500
    : status === 'next'
      ? 1200
      : status === 'previous'
        ? 1100
        : round.round

  return (
    <Marker
      ref={ref}
      position={stop.latLng}
      icon={icon}
      zIndexOffset={zIndexOffset}
      riseOnHover
      eventHandlers={{
        click: () => {
          if (raced) router.push(`/seasons/${year}/races/${round.round}`)
          else onSelect(stop.index)
        },
      }}
    >
      <Tooltip direction="top" offset={[0, -MARKER_SIZE / 2 - 2]} className={styles.tooltip}>
        <div className="space-y-0.5 text-xs">
          <div className="label">
            Round {round.round}
            {round.date && (
              <>
                {' · '}
                <LocalDate value={round.date} style="medium" />
              </>
            )}
          </div>
          <div className="text-sm font-semibold">{round.name}</div>
          {round.winner ? (
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-1"
                style={{ backgroundColor: round.winner.constructor?.color ?? MAP_NEUTRAL }}
              />
              <span>
                {round.winner.driver.firstName} {round.winner.driver.lastName}
              </span>
              {round.winner.constructor && (
                <span className="text-muted-foreground">· {round.winner.constructor.name}</span>
              )}
            </div>
          ) : (
            <div className="text-muted-foreground">
              {status === 'next' ? 'Next race — click for details' : 'Not yet raced'}
            </div>
          )}
        </div>
      </Tooltip>
    </Marker>
  )
}
