'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MapContainer, GeoJSON, CircleMarker, Pane, Tooltip } from 'react-leaflet'
import type { FeatureCollection } from 'geojson'
import { MAP_INK, MAP_LAND, MAP_OCEAN, MAP_RED } from '@/lib/map-theme'
import 'leaflet/dist/leaflet.css'

interface CircuitPin {
  ref: string
  name: string
  country: string | null
  latitude: number
  longitude: number
}

interface WorldMapProps {
  circuits: CircuitPin[]
}

const WORLD_GEOJSON_URL = '/geo/world.geo.json'

const landStyle = MAP_LAND

export function WorldMap({ circuits }: WorldMapProps) {
  const router = useRouter()
  const [world, setWorld] = useState<FeatureCollection | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(WORLD_GEOJSON_URL)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: FeatureCollection | null) => {
        if (!cancelled) setWorld(data)
      })
      .catch(() => null)
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <MapContainer
      center={[20, 10]}
      zoom={2}
      minZoom={2}
      maxZoom={10}
      scrollWheelZoom={false}
      attributionControl={false}
      className="h-full w-full"
      style={{ background: MAP_OCEAN }}
    >
      <Pane name="circuits-land" style={{ zIndex: '250' }}>
        {world && <GeoJSON data={world} style={() => landStyle} interactive={false} />}
      </Pane>
      {circuits.map((circuit) => (
        <CircleMarker
          key={circuit.ref}
          center={[circuit.latitude, circuit.longitude]}
          radius={6}
          pathOptions={{
            fillColor: MAP_RED,
            fillOpacity: 0.85,
            color: MAP_INK,
            weight: 1.5,
            opacity: 0.6,
          }}
          eventHandlers={{
            click: () => router.push(`/circuits/${circuit.ref}`),
          }}
        >
          <Tooltip direction="top" offset={[0, -8]}>
            <span className="font-sans text-xs font-medium">
              {circuit.name}
              {circuit.country && (
                <span className="text-muted-foreground"> · {circuit.country}</span>
              )}
            </span>
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  )
}
