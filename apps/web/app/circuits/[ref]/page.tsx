import Link from 'next/link'
import { api } from '@/lib/api'
import type { Circuit } from '@/lib/types'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export const dynamic = 'force-dynamic'

interface CircuitRace {
  id: string
  seasonYear: number
  round: number
  name: string
  date: string | null
}

interface CircuitDetail extends Circuit {
  races: CircuitRace[]
}

export async function generateMetadata({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params
  const circuit = (await api.circuits.get(ref)) as CircuitDetail
  return {
    title: `${circuit.name} | F1 Tracker`,
    description: `Race history at ${circuit.name}, ${circuit.location}, ${circuit.country}`,
  }
}

export default async function CircuitDetailPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params
  const circuit = (await api.circuits.get(ref)) as CircuitDetail

  return (
    <div className="space-y-8">
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: 'Circuits', href: '/circuits' },
          { label: circuit.name },
        ]}
      />
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">{circuit.name}</h1>
        <p className="text-muted-foreground">
          {circuit.location}, {circuit.country}
        </p>
        {circuit.latitude != null && circuit.longitude != null && (
          <p className="text-muted-foreground text-sm">
            {circuit.latitude.toFixed(4)}, {circuit.longitude.toFixed(4)}
          </p>
        )}
      </div>

      <div>
        <h2 className="mb-4 text-xl font-semibold">Races ({circuit.races.length})</h2>
        {circuit.races.length === 0 ? (
          <p className="text-muted-foreground text-sm">No race data available.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Year</TableHead>
                <TableHead className="w-16">Round</TableHead>
                <TableHead>Race</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {circuit.races.map((race) => (
                <TableRow key={race.id}>
                  <TableCell>
                    <Link href={`/seasons/${race.seasonYear}`} className="hover:underline">
                      {race.seasonYear}
                    </Link>
                  </TableCell>
                  <TableCell>{race.round}</TableCell>
                  <TableCell>
                    <Link
                      href={`/seasons/${race.seasonYear}/races/${race.round}`}
                      className="hover:underline"
                    >
                      {race.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {race.date
                      ? new Date(race.date).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })
                      : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}
