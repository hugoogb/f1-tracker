'use client'

import Link from 'next/link'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { CountryFlag } from '@/components/ui/country-flag'
import { DriverAvatar } from '@/components/ui/driver-avatar'
import type { CircuitStats } from '@/lib/types'

function WinnersTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value: number; payload: { driverName: string; color: string } }>
  label?: string
}) {
  if (!active || !payload?.length) return null

  const { payload: item } = payload[0]

  return (
    <div
      className="rounded-xl px-3 py-2"
      style={{
        backgroundColor: 'oklch(0.13 0.003 250 / 85%)',
        border: '1px solid oklch(1 0 0 / 10%)',
        color: 'oklch(0.95 0 0)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <p className="text-sm font-medium">{label}</p>
      <div className="mt-0.5 flex items-center gap-2">
        <span
          className="inline-block size-2.5 rounded-full"
          style={{ backgroundColor: item.color }}
        />
        <span className="text-muted-foreground text-sm">{item.driverName}</span>
      </div>
    </div>
  )
}

interface CircuitStatsViewProps {
  stats: CircuitStats
}

export function CircuitStatsView({ stats }: CircuitStatsViewProps) {
  const hasWins = stats.mostWins.length > 0
  const hasPoles = stats.mostPoles.length > 0
  const hasHistory = stats.winningHistory.length > 0

  if (!hasWins && !hasPoles && !hasHistory) return null

  // Winners timeline chart data (last 30 years for readability)
  const timelineData = stats.winningHistory
    .slice(0, 30)
    .reverse()
    .map((w) => ({
      year: w.year,
      wins: 1,
      color: w.winner.constructor.color ?? '#888888',
      driverName: `${w.winner.driver.firstName} ${w.winner.driver.lastName}`,
      constructorName: w.winner.constructor.name,
    }))

  return (
    <div className="space-y-6">
      {/* Most Wins + Most Poles */}
      <div className="grid gap-6 md:grid-cols-2">
        {hasWins && (
          <div>
            <h3 className="mb-3 text-sm font-medium">Most Wins</h3>
            <div className="space-y-2">
              {stats.mostWins.slice(0, 5).map((entry, i) => (
                <div key={entry.driver.ref} className="flex items-center gap-3">
                  <span className="text-muted-foreground w-5 text-right text-sm font-medium">
                    {i + 1}
                  </span>
                  <DriverAvatar
                    firstName={entry.driver.firstName}
                    lastName={entry.driver.lastName}
                    headshotUrl={entry.driver.headshotUrl}
                    size="sm"
                  />
                  <div className="flex-1">
                    <Link
                      href={`/drivers/${entry.driver.ref}`}
                      className="hover:text-primary text-sm font-medium transition-colors"
                    >
                      {entry.driver.firstName} {entry.driver.lastName}
                    </Link>
                    {entry.driver.countryCode && (
                      <span className="ml-1.5">
                        <CountryFlag code={entry.driver.countryCode} />
                      </span>
                    )}
                  </div>
                  <span className="font-heading text-sm font-bold tabular-nums">{entry.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {hasPoles && (
          <div>
            <h3 className="mb-3 text-sm font-medium">Most Poles</h3>
            <div className="space-y-2">
              {stats.mostPoles.slice(0, 5).map((entry, i) => (
                <div key={entry.driver.ref} className="flex items-center gap-3">
                  <span className="text-muted-foreground w-5 text-right text-sm font-medium">
                    {i + 1}
                  </span>
                  <DriverAvatar
                    firstName={entry.driver.firstName}
                    lastName={entry.driver.lastName}
                    headshotUrl={entry.driver.headshotUrl}
                    size="sm"
                  />
                  <div className="flex-1">
                    <Link
                      href={`/drivers/${entry.driver.ref}`}
                      className="hover:text-primary text-sm font-medium transition-colors"
                    >
                      {entry.driver.firstName} {entry.driver.lastName}
                    </Link>
                    {entry.driver.countryCode && (
                      <span className="ml-1.5">
                        <CountryFlag code={entry.driver.countryCode} />
                      </span>
                    )}
                  </div>
                  <span className="font-heading text-sm font-bold tabular-nums">{entry.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Winners Timeline */}
      {timelineData.length > 1 && (
        <div>
          <h3 className="mb-3 text-sm font-medium">Recent Winners</h3>
          <div className="h-48" role="img" aria-label="Circuit winners timeline">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={timelineData} margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="oklch(1 0 0 / 6%)" />
                <XAxis
                  dataKey="year"
                  tick={{ fontSize: 11, fill: 'oklch(0.6 0 0)' }}
                  interval={Math.max(0, Math.floor(timelineData.length / 10) - 1)}
                />
                <YAxis hide />
                <Tooltip
                  content={<WinnersTooltip />}
                  cursor={{ fill: 'var(--muted)', opacity: 0.3 }}
                />
                <Bar dataKey="wins" radius={[4, 4, 0, 0]} animationDuration={600}>
                  {timelineData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} fillOpacity={0.9} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}
