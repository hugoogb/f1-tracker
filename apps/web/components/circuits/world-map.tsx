'use client'

import { useRouter } from 'next/navigation'
import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet'
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

export function WorldMap({ circuits }: WorldMapProps) {
  const router = useRouter()

  return (
    <MapContainer
      center={[20, 10]}
      zoom={2}
      minZoom={2}
      maxZoom={10}
      scrollWheelZoom={false}
      className="h-full w-full"
      style={{ background: '#0a0a0a' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
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
