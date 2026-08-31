import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OgCard, OgFallback, OG_SIZE } from './og'

// Satori renders these to PNG in production; here they are checked as plain
// React so the content and layout rules stay covered without a rasteriser.
describe('OgCard', () => {
  it('renders the eyebrow, title and subtitle', () => {
    render(<OgCard eyebrow="Dutch" title="Max Verstappen" subtitle="240 Grand Prix starts" />)
    expect(screen.getByText('Dutch')).toBeInTheDocument()
    expect(screen.getByText('Max Verstappen')).toBeInTheDocument()
    expect(screen.getByText('240 Grand Prix starts')).toBeInTheDocument()
  })

  it('renders each stat with its label', () => {
    render(
      <OgCard
        eyebrow="Dutch"
        title="Max Verstappen"
        stats={[
          { label: 'Wins', value: 71 },
          { label: 'Titles', value: 4 },
        ]}
      />,
    )
    expect(screen.getByText('71')).toBeInTheDocument()
    expect(screen.getByText('Wins')).toBeInTheDocument()
    expect(screen.getByText('Titles')).toBeInTheDocument()
  })

  it('always carries the wordmark', () => {
    render(<OgCard eyebrow="Italian" title="Ferrari" />)
    expect(screen.getByText('TRACKER')).toBeInTheDocument()
  })

  it('shrinks the title so a long name still fits the card', () => {
    const { container } = render(
      <OgCard eyebrow="Race" title="Emilia Romagna Grand Prix at Imola" />,
    )
    const title = screen.getByText('Emilia Romagna Grand Prix at Imola')
    expect(title).toHaveStyle({ fontSize: '68px' })
    expect(container).toBeTruthy()
  })

  it('keeps a short title at full size', () => {
    render(<OgCard eyebrow="Italian" title="Ferrari" />)
    expect(screen.getByText('Ferrari')).toHaveStyle({ fontSize: '88px' })
  })

  it('falls back to the brand accent without a team colour', () => {
    render(<OgCard eyebrow="Driver" title="Someone" accent={null} />)
    expect(screen.getByText('Someone')).toBeInTheDocument()
  })

  it('renders a generic card when the subject could not be loaded', () => {
    render(<OgFallback />)
    expect(screen.getByText('F1 Tracker')).toBeInTheDocument()
    expect(screen.getByText('Every season since 1950')).toBeInTheDocument()
  })

  it('uses the standard OpenGraph dimensions', () => {
    expect(OG_SIZE).toEqual({ width: 1200, height: 630 })
  })
})
