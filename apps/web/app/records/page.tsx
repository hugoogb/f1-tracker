import Link from 'next/link'
import { Trophy, Medal, Timer, Flag, Zap, Award } from 'lucide-react'
import { api } from '@/lib/api'
import type { RecordsResponse, DriverRecordEntry, ConstructorRecordEntry } from '@/lib/types'
import { DriverAvatar } from '@/components/ui/driver-avatar'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PositionBadge } from '@/components/ui/position-badge'
import { FadeIn, StaggerList, StaggerItem } from '@/components/ui/motion'
import { RecordsTabs } from './records-tabs'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Records | F1 Tracker',
  description: 'All-time Formula 1 records — most wins, poles, podiums, championships, and more.',
}

function DriverRecordTable({
  title,
  icon: Icon,
  entries,
  label,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  entries: DriverRecordEntry[]
  label: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="text-primary h-4 w-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table aria-label={title}>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Driver</TableHead>
              <TableHead className="text-right">{label}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry, idx) => (
              <TableRow key={entry.driver.ref}>
                <TableCell>
                  <PositionBadge position={idx + 1} size="sm" />
                </TableCell>
                <TableCell>
                  <Link
                    href={`/drivers/${entry.driver.ref}`}
                    className="inline-flex items-center gap-2"
                  >
                    <DriverAvatar
                      firstName={entry.driver.firstName}
                      lastName={entry.driver.lastName}
                      headshotUrl={entry.driver.headshotUrl}
                    />
                    <span className="hover:text-primary font-medium transition-colors">
                      {entry.driver.firstName} {entry.driver.lastName}
                    </span>
                  </Link>
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">{entry.count}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function ConstructorRecordTable({
  title,
  icon: Icon,
  entries,
  label,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  entries: ConstructorRecordEntry[]
  label: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="text-primary h-4 w-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table aria-label={title}>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Constructor</TableHead>
              <TableHead className="text-right">{label}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry, idx) => (
              <TableRow key={entry.constructor.ref}>
                <TableCell>
                  <PositionBadge position={idx + 1} size="sm" />
                </TableCell>
                <TableCell>
                  <Link
                    href={`/constructors/${entry.constructor.ref}`}
                    className="inline-flex items-center gap-2"
                  >
                    {entry.constructor.color && (
                      <span
                        className="inline-block size-3 rounded-full"
                        style={{ backgroundColor: entry.constructor.color }}
                      />
                    )}
                    <span className="hover:text-primary font-medium transition-colors">
                      {entry.constructor.name}
                    </span>
                  </Link>
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">{entry.count}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

export default async function RecordsPage() {
  const records = (await api.records()) as RecordsResponse

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Records' }]} />

      <FadeIn>
        <PageHeader
          title="All-Time Records"
          description="The greatest achievements in Formula 1 history"
        />
      </FadeIn>

      <RecordsTabs
        driversContent={
          <StaggerList className="grid gap-6 md:grid-cols-2">
            <StaggerItem>
              <DriverRecordTable
                title="Most Championships"
                icon={Award}
                entries={records.drivers.mostChampionships}
                label="Titles"
              />
            </StaggerItem>
            <StaggerItem>
              <DriverRecordTable
                title="Most Race Wins"
                icon={Trophy}
                entries={records.drivers.mostWins}
                label="Wins"
              />
            </StaggerItem>
            <StaggerItem>
              <DriverRecordTable
                title="Most Podiums"
                icon={Medal}
                entries={records.drivers.mostPodiums}
                label="Podiums"
              />
            </StaggerItem>
            <StaggerItem>
              <DriverRecordTable
                title="Most Pole Positions"
                icon={Timer}
                entries={records.drivers.mostPoles}
                label="Poles"
              />
            </StaggerItem>
            <StaggerItem>
              <DriverRecordTable
                title="Most Fastest Laps"
                icon={Zap}
                entries={records.drivers.mostFastestLaps}
                label="Fastest Laps"
              />
            </StaggerItem>
            <StaggerItem>
              <DriverRecordTable
                title="Most Race Starts"
                icon={Flag}
                entries={records.drivers.mostStarts}
                label="Starts"
              />
            </StaggerItem>
          </StaggerList>
        }
        constructorsContent={
          <StaggerList className="grid gap-6 md:grid-cols-2">
            <StaggerItem>
              <ConstructorRecordTable
                title="Most Constructor Championships"
                icon={Award}
                entries={records.constructors.mostChampionships}
                label="Titles"
              />
            </StaggerItem>
            <StaggerItem>
              <ConstructorRecordTable
                title="Most Race Wins"
                icon={Trophy}
                entries={records.constructors.mostWins}
                label="Wins"
              />
            </StaggerItem>
          </StaggerList>
        }
      />
    </div>
  )
}
