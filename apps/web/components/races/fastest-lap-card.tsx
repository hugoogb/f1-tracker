import Link from 'next/link'
import type { FastestLap } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { FadeIn } from '@/components/ui/motion'

export function FastestLapCard({ fastestLap }: { fastestLap: FastestLap }) {
  return (
    <FadeIn>
      <Card className="border border-purple-500/30 bg-purple-500/5">
        <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
          <p className="text-xs font-medium tracking-wider text-purple-400 uppercase">
            Fastest Lap
          </p>
          <div className="flex items-center gap-2">
            {fastestLap.constructor?.color && (
              <span
                className="inline-block h-3 w-1 rounded-full"
                style={{ backgroundColor: fastestLap.constructor.color }}
              />
            )}
            <Link
              href={`/drivers/${fastestLap.driver.ref}`}
              className="hover:text-primary text-sm font-semibold transition-colors"
            >
              {fastestLap.driver.firstName} {fastestLap.driver.lastName}
            </Link>
          </div>
          <span className="font-mono text-sm text-purple-300">{fastestLap.time}</span>
          <span className="text-muted-foreground text-xs">
            {fastestLap.lapNumber && `Lap ${fastestLap.lapNumber}`}
            {fastestLap.lapNumber && fastestLap.speed && ' · '}
            {fastestLap.speed && `${fastestLap.speed} km/h`}
          </span>
        </CardContent>
      </Card>
    </FadeIn>
  )
}
