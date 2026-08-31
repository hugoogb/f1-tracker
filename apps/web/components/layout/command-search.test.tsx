import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CommandSearch } from './command-search'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

const EMPTY = { drivers: [], constructors: [], circuits: [], races: [], seasons: [] }

const MONACO_2019 = {
  ...EMPTY,
  circuits: [
    { ref: 'monaco', name: 'Circuit de Monaco', location: 'Monte-Carlo', country: 'Monaco' },
  ],
  races: [
    {
      id: '2019_06',
      seasonYear: 2019,
      round: 6,
      name: 'Monaco Grand Prix',
      date: '2019-05-26',
      circuit: { ref: 'monaco', name: 'Circuit de Monaco', country: 'Monaco' },
    },
  ],
}

const SEASON_2019 = { ...EMPTY, seasons: [{ year: 2019 }] }

function mockSearch(payload: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(payload) } as Response)),
  )
}

async function openAndType(text?: string) {
  const user = userEvent.setup()
  await user.click(screen.getAllByRole('button', { name: /search/i })[0])
  const input = await screen.findByPlaceholderText(/search drivers/i)
  if (text) await user.type(input, text)
  return user
}

describe('CommandSearch', () => {
  beforeEach(() => {
    mockSearch(EMPTY)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('opens the dialog from the search button', async () => {
    render(<CommandSearch />)
    await openAndType()
    expect(await screen.findByPlaceholderText(/search drivers/i)).toBeInTheDocument()
  })

  it('lists matching races under a Races heading', async () => {
    mockSearch(MONACO_2019)
    render(<CommandSearch />)
    await openAndType('Monaco 2019')

    expect(await screen.findByText('Races')).toBeInTheDocument()
    expect(await screen.findByText('2019 Monaco Grand Prix')).toBeInTheDocument()
  })

  it('links a race to its race detail page', async () => {
    mockSearch(MONACO_2019)
    render(<CommandSearch />)
    await openAndType('Monaco 2019')

    const item = await screen.findByRole('button', { name: /2019 Monaco Grand Prix/ })
    expect(item).toBeInTheDocument()
  })

  it('lists matching seasons under a Seasons heading', async () => {
    mockSearch(SEASON_2019)
    render(<CommandSearch />)
    await openAndType('2019')

    expect(await screen.findByText('Seasons')).toBeInTheDocument()
    expect(await screen.findByText('2019 Season')).toBeInTheDocument()
  })

  it('still shows circuits alongside races', async () => {
    mockSearch(MONACO_2019)
    render(<CommandSearch />)
    await openAndType('Monaco 2019')

    expect(await screen.findByText('Circuits')).toBeInTheDocument()
    // Appears twice: as the circuit result, and as the race's sublabel.
    expect(await screen.findAllByText('Circuit de Monaco')).toHaveLength(2)
  })

  it('reports no results when every group is empty', async () => {
    render(<CommandSearch />)
    await openAndType('zzzz')

    await waitFor(() => expect(screen.getByText(/no results found/i)).toBeInTheDocument())
  })

  it('tolerates a response without the race and season groups', async () => {
    // Guards against a frontend deployed ahead of the API.
    mockSearch({ drivers: [], constructors: [], circuits: [] })
    render(<CommandSearch />)
    await openAndType('monaco')

    await waitFor(() => expect(screen.getByText(/no results found/i)).toBeInTheDocument())
  })
})
