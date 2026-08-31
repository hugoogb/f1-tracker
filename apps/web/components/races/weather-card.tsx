import { CloudRain, Sun, Thermometer, Wind, Droplets } from 'lucide-react'
import type { WeatherSummary } from '@/lib/types'

interface WeatherCardProps {
  summary: WeatherSummary
}

function range(min: number | null, max: number | null, unit: string): string {
  if (min === null && max === null) return '—'
  if (min === null || max === null) return `${min ?? max}${unit}`
  return min === max ? `${min}${unit}` : `${min}–${max}${unit}`
}

export function WeatherCard({ summary }: WeatherCardProps) {
  const wetPercent = Math.round(summary.wetShare * 100)

  const stats = [
    {
      icon: Thermometer,
      label: 'Air',
      value: range(summary.airTempMin, summary.airTempMax, '°C'),
    },
    {
      icon: Sun,
      label: 'Track',
      value: range(summary.trackTempMin, summary.trackTempMax, '°C'),
    },
    {
      icon: Droplets,
      label: 'Humidity',
      value: summary.humidityAvg === null ? '—' : `${summary.humidityAvg}%`,
    },
    {
      icon: Wind,
      label: 'Wind',
      value: summary.windSpeedMax === null ? '—' : `${summary.windSpeedMax} m/s`,
    },
  ]

  return (
    <section className="glass rounded-xl p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-muted-foreground flex items-center gap-2 text-xs font-medium tracking-widest uppercase">
          {summary.rainfall ? (
            <CloudRain className="h-3.5 w-3.5" />
          ) : (
            <Sun className="h-3.5 w-3.5" />
          )}
          Conditions
        </h2>
        {summary.rainfall && (
          <span className="text-primary text-xs font-medium">
            Rain recorded on {wetPercent}% of the session
          </span>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map(({ icon: Icon, label, value }) => (
          <div key={label} className="space-y-1">
            <dt className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <Icon className="h-3 w-3" />
              {label}
            </dt>
            <dd className="font-heading text-lg font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <p className="text-muted-foreground mt-3 text-xs">
        From {summary.samples} samples taken through the race.
      </p>
    </section>
  )
}
