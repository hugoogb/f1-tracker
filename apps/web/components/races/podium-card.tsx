import Link from 'next/link'
import type { RaceResult } from '@/lib/types'
import { getTeamColor } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { PodiumReveal } from '@/components/ui/motion'

const podiumColors = [
  'border-amber-500/40 bg-amber-500/5',
  'border-zinc-400/40 bg-zinc-400/5',
  'border-orange-600/40 bg-orange-600/5',
]

const podiumLabels = ['1st', '2nd', '3rd']

export function PodiumCard({ podium }: { podium: RaceResult[] }) {
  if (podium.length === 0) return null

  return (
    <PodiumReveal>
      {podium.map((result) => {
        const teamColor = getTeamColor(result.constructor.ref, result.constructor.color, null)
        const idx = (result.position ?? 1) - 1

        return (
          <Card key={result.driver.ref} className={`${podiumColors[idx]} border`}>
            <CardContent className="space-y-1 px-4 py-3">
              <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
                {podiumLabels[idx]}
              </p>
              <Link
                href={`/drivers/${result.driver.ref}`}
                className="hover:text-primary text-sm font-semibold transition-colors"
              >
                {result.driver.firstName} {result.driver.lastName}
              </Link>
              <div className="flex items-center gap-1.5">
                {teamColor && (
                  <span
                    className="inline-block h-3 w-1 rounded-full"
                    style={{ backgroundColor: teamColor }}
                  />
                )}
                <Link
                  href={`/constructors/${result.constructor.ref}`}
                  className="text-muted-foreground hover:text-foreground text-xs transition-colors"
                >
                  {result.constructor.name}
                </Link>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </PodiumReveal>
  )
}
