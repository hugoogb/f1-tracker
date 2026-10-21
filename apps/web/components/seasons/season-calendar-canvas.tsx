'use client'

import { memo, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import L from 'leaflet'
import {
  GeoJSON,
  MapContainer,
  Marker,
  Pane,
  Polyline,
  Tooltip,
  ZoomControl,
  useMap,
} from 'react-leaflet'
import type { FeatureCollection } from 'geojson'
import 'leaflet/dist/leaflet.css'
import { LocalDate } from '@/components/ui/local-date'
import { normaliseLng, pathPrefix, pointAlong, splitAtAntimeridian, type LatLng } from '@/lib/geo'
import type { CalendarCamera, CalendarLeg, CalendarStop, Playhead } from './season-calendar-model'
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

// The land arrives after a fetch, so in the shared overlay SVG it would be
// appended after the routes and paint over them. Its own pane, below the
// overlay pane (400), keeps it underneath whenever it lands.
const LAND_PANE = 'calendar-land'

const landStyle = {
  fillColor: '#18181b',
  fillOpacity: 1,
  color: '#2c2c31',
  weight: 0.6,
}

const RED = '#E10600'
const RED_HOT = '#ff3b2f'

const MARKER_SIZE = 24
const GLYPH_SIZE = 22

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

  // On a touch screen a one-finger drag has to scroll the page, not pan the
  // map — two fingers still pan and pinch-zoom it.
  const touch = L.Browser.mobile
  // Leaflet's SVG renderer only redraws on `moveend`, so mid-flight the land
  // would be clipped to the frame the flight started from. A generous padding
  // keeps the continents drawn while the camera moves.
  const renderer = useMemo(() => L.svg({ padding: 1.5 }), [])
  // A pane's default renderer would fall back to Leaflet's 0.1 padding. GeoJSON
  // hands its options to every polygon it builds, `renderer` included; only
  // react-leaflet's types leave it out.
  const landOptions = useMemo(
    () => ({ renderer: L.svg({ padding: 1.5, pane: LAND_PANE }) }) as Record<string, unknown>,
    [],
  )

  return (
    <MapContainer
      center={[25, 10]}
      zoom={2}
      minZoom={1}
      maxZoom={9}
      zoomSnap={0.25}
      zoomDelta={0.5}
      scrollWheelZoom={false}
      dragging={!touch}
      touchZoom
      attributionControl={false}
      zoomControl={false}
      renderer={renderer}
      maxBounds={[
        [-80, -230],
        [86, 230],
      ]}
      maxBoundsViscosity={0.8}
      className={`${styles.map} h-full w-full`}
    >
      <Pane name={LAND_PANE} style={{ zIndex: '250' }}>
        {world && (
          <GeoJSON {...landOptions} data={world} style={() => landStyle} interactive={false} />
        )}
      </Pane>
      <ZoomControl position="bottomright" />
      <CameraController camera={camera} stops={stops} legs={legs} />
      <Route legs={legs} />
      <TravelledRoute legs={legs} playhead={playhead} />
      <ActiveLeg legs={legs} stops={stops} playhead={playhead} />
      <Markers year={year} stops={stops} focus={focus} onSelect={onSelect} />
    </MapContainer>
  )
}

/** Executes camera commands: each new `nonce` is one flight (or one jump). */
function CameraController({
  camera,
  stops,
  legs,
}: {
  camera: CalendarCamera
  stops: CalendarStop[]
  legs: (CalendarLeg | null)[]
}) {
  const map = useMap()
  // Positions only — statuses change by the minute and must not re-fire a flight.
  const positions = useMemo(() => stops.map((s) => s.latLng), [stops])

  useEffect(() => {
    const size = map.getSize()
    const compact = size.x < 640
    const padding = L.point(compact ? 28 : 64, compact ? 28 : 56)
    const animate = camera.animate
    map.stop()

    if (camera.kind === 'overview') {
      if (positions.length === 0) return
      const bounds = L.latLngBounds(positions)
      if (animate) {
        map.flyToBounds(bounds, { padding, duration: 1.4, maxZoom: 5 })
      } else {
        map.fitBounds(bounds, { padding, animate: false, maxZoom: 5 })
      }
      return
    }

    if (camera.kind === 'stop') {
      const target = positions[camera.index]
      if (!target) return
      const zoom = camera.zoom ?? (compact ? 3.5 : 4.25)
      if (animate) {
        map.flyTo(target, zoom, { duration: (camera.ms ?? 1200) / 1000, easeLinearity: 0.2 })
      } else {
        map.setView(target, zoom, { animate: false })
      }
      return
    }

    // A leg: frame both ends and fly while the glyph travels.
    const leg = legs[camera.to]
    if (!leg) return
    const points = leg.path.map(([lat, lng]): LatLng => [lat, normaliseLng(lng)])
    const bounds = L.latLngBounds(points)
    if (animate) {
      map.flyToBounds(bounds, {
        padding,
        maxZoom: compact ? 4 : 5,
        duration: Math.max(0.6, camera.ms / 1000),
        easeLinearity: 0.15,
      })
    } else {
      map.fitBounds(bounds, { padding, maxZoom: compact ? 4 : 5, animate: false })
    }
    // `camera` is the command; positions/legs are stable for a given season.
  }, [camera, map, positions, legs])

  return null
}

function legRuns(legs: (CalendarLeg | null)[], upTo: number): LatLng[][] {
  const runs: LatLng[][] = []
  for (let i = 1; i <= upTo && i < legs.length; i++) {
    const leg = legs[i]
    if (leg) runs.push(...splitAtAntimeridian(leg.path))
  }
  return runs
}

/** The whole calendar as a faint marching route: where the season goes. */
const Route = memo(function Route({ legs }: { legs: (CalendarLeg | null)[] }) {
  const runs = useMemo(() => legRuns(legs, legs.length - 1), [legs])
  if (runs.length === 0) return null
  return (
    <Polyline
      positions={runs}
      interactive={false}
      pathOptions={{ color: '#ffffff', opacity: 0.28, weight: 1.4, className: styles.route }}
    />
  )
})

/** Legs already flown, up to the playhead's last completed stop. */
function TravelledRoute({ legs, playhead }: { legs: (CalendarLeg | null)[]; playhead: Playhead }) {
  // Only the integer part: this re-renders once per arrival, not once a frame.
  const reached = useSyncExternalStore(
    playhead.subscribe,
    () => Math.floor(playhead.get()),
    () => Math.floor(playhead.get()),
  )
  const runs = useMemo(() => legRuns(legs, reached), [legs, reached])
  if (runs.length === 0) return null
  return (
    <>
      <Polyline
        positions={runs}
        interactive={false}
        pathOptions={{ color: RED, opacity: 0.22, weight: 7, lineCap: 'round' }}
      />
      <Polyline
        positions={runs}
        interactive={false}
        pathOptions={{ color: RED_HOT, opacity: 0.95, weight: 2, lineCap: 'round' }}
      />
    </>
  )
}

function glyphIcon() {
  return L.divIcon({
    className: styles.glyphWrap,
    iconSize: [GLYPH_SIZE, GLYPH_SIZE],
    iconAnchor: [GLYPH_SIZE / 2, GLYPH_SIZE / 2],
    // A navigation arrow pointing north; rotated to the heading every frame.
    html: `<div class="${styles.glyph}"><div class="${styles.glyphHalo}"></div><svg class="${styles.glyphArrow}" viewBox="0 0 24 24" width="${GLYPH_SIZE}" height="${GLYPH_SIZE}" aria-hidden="true"><path d="M12 2 L20 21 L12 16.5 L4 21 Z" fill="#ffffff" stroke="${RED}" stroke-width="1.6" stroke-linejoin="round"/></svg></div>`,
  })
}

/**
 * The leg in progress, drawn as far as the playhead has got, and the glyph
 * riding its tip. Both are moved imperatively from a playhead subscription —
 * sixty React renders a second of the whole map would be wasted work.
 */
function ActiveLeg({
  legs,
  stops,
  playhead,
}: {
  legs: (CalendarLeg | null)[]
  stops: CalendarStop[]
  playhead: Playhead
}) {
  const map = useMap()
  const glowRef = useRef<L.Polyline>(null)
  const coreRef = useRef<L.Polyline>(null)
  const glyphRef = useRef<L.Marker>(null)
  const icon = useMemo(() => glyphIcon(), [])
  const start = stops[0]?.latLng ?? ([0, 0] as LatLng)

  useEffect(() => {
    const update = () => {
      const pos = playhead.get()
      const from = Math.floor(pos)
      const frac = pos - from
      const leg = legs[from + 1]
      const glow = glowRef.current
      const core = coreRef.current
      const glyph = glyphRef.current
      if (!glow || !core || !glyph) return

      const travelling = frac > 1e-4 && leg
      const runs = travelling ? splitAtAntimeridian(pathPrefix(leg.path, frac)) : []
      glow.setLatLngs(runs)
      core.setLatLngs(runs)

      const element = glyph.getElement()
      if (travelling) {
        const here = pointAlong(leg.path, frac)
        const ahead = pointAlong(leg.path, Math.min(1, frac + 0.02))
        glyph.setLatLng(here)
        const a = map.latLngToLayerPoint(here)
        const b = map.latLngToLayerPoint(ahead)
        const heading = (Math.atan2(b.x - a.x, a.y - b.y) * 180) / Math.PI
        const arrow = element?.querySelector('svg')
        if (arrow && Number.isFinite(heading) && (a.x !== b.x || a.y !== b.y)) {
          arrow.style.transform = `rotate(${heading}deg)`
        }
      } else if (stops[from]) {
        glyph.setLatLng(stops[from].latLng)
      }
      if (element) element.style.opacity = travelling ? '1' : '0'
    }

    update()
    const unsubscribe = playhead.subscribe(update)
    // The heading is computed in screen space, so it has to follow zooms too.
    map.on('zoomend', update)
    return () => {
      unsubscribe()
      map.off('zoomend', update)
    }
  }, [legs, stops, playhead, map])

  return (
    <>
      <Polyline
        ref={glowRef}
        positions={[]}
        interactive={false}
        pathOptions={{ color: RED, opacity: 0.35, weight: 9, lineCap: 'round' }}
      />
      <Polyline
        ref={coreRef}
        positions={[]}
        interactive={false}
        pathOptions={{ color: '#ffffff', opacity: 0.95, weight: 2.2, lineCap: 'round' }}
      />
      <Marker
        ref={glyphRef}
        position={start}
        icon={icon}
        interactive={false}
        keyboard={false}
        zIndexOffset={2000}
      />
    </>
  )
}

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
          <div className="text-muted-foreground font-mono text-[10px] tracking-wider uppercase">
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
                className="inline-block h-3 w-1 rounded-full"
                style={{ backgroundColor: round.winner.constructor?.color ?? '#888' }}
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
