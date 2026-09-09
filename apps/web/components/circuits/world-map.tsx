'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MapContainer, GeoJSON, CircleMarker, Tooltip } from 'react-leaflet'
import type { FeatureCollection } from 'geojson'
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

// Landmass is drawn from bundled Natural Earth geometry (public domain) rather
// than raster basemap tiles, so the map carries no attribution requirement and
// no non-commercial restriction. See apps/web/public/geo/README.txt.
const WORLD_GEOJSON_URL = '/geo/world.geo.json'

const landStyle = {
  fillColor: '#1c1c1f',
  fillOpacity: 1,
  color: '#2e2e33',
  weight: 0.5,
}

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
      .catch(() => {
        // Circuit markers still render without the landmass underneath.
      })
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
      style={{ background: '#0a0a0a' }}
    >
      {world && <GeoJSON data={world} style={() => landStyle} interactive={false} />}
      {circuits.map((circuit) => (
        <CircleMarker
          key={circuit.ref}
          center={[circuit.latitude, circuit.longitude]}
          radius={6}
          pathOptions={{
            fillColor: '#E10600',
            fillOpacity: 0.85,
            color: '#ffffff',
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
              {circuit.country && <span className="text-gray-400"> · {circuit.country}</span>}
            </span>
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  )
}
