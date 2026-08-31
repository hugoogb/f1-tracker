import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WeatherCard } from './weather-card'
import type { WeatherSummary } from '@/lib/types'

function summary(overrides: Partial<WeatherSummary> = {}): WeatherSummary {
  return {
    airTempMin: 23,
    airTempMax: 25.5,
    trackTempMin: 27.6,
    trackTempMax: 35.2,
    humidityAvg: 44.9,
    windSpeedMax: 3.7,
    rainfall: false,
    wetShare: 0,
    samples: 120,
    ...overrides,
  }
}

describe('WeatherCard', () => {
  it('shows temperature ranges', () => {
    render(<WeatherCard summary={summary()} />)
    expect(screen.getByText('23–25.5°C')).toBeInTheDocument()
    expect(screen.getByText('27.6–35.2°C')).toBeInTheDocument()
  })

  it('collapses a range with no spread to a single value', () => {
    render(<WeatherCard summary={summary({ airTempMin: 24, airTempMax: 24 })} />)
    expect(screen.getByText('24°C')).toBeInTheDocument()
  })

  it('shows humidity and wind', () => {
    render(<WeatherCard summary={summary()} />)
    expect(screen.getByText('44.9%')).toBeInTheDocument()
    expect(screen.getByText('3.7 m/s')).toBeInTheDocument()
  })

  it('says nothing about rain in a dry race', () => {
    render(<WeatherCard summary={summary()} />)
    expect(screen.queryByText(/rain recorded/i)).not.toBeInTheDocument()
  })

  it('reports how much of a wet race saw rain', () => {
    render(<WeatherCard summary={summary({ rainfall: true, wetShare: 0.42 })} />)
    expect(screen.getByText(/rain recorded on 42% of the session/i)).toBeInTheDocument()
  })

  it('renders a dash for a channel with no data', () => {
    render(<WeatherCard summary={summary({ humidityAvg: null, windSpeedMax: null })} />)
    expect(screen.getAllByText('—')).toHaveLength(2)
  })

  it('states the sample count', () => {
    render(<WeatherCard summary={summary()} />)
    expect(screen.getByText(/from 120 samples/i)).toBeInTheDocument()
  })
})
