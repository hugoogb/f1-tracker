import Link from 'next/link'
import type { RaceResult } from '@/lib/types'
import { teamColorOf } from '@/lib/utils'
import { Panel, PanelContent } from '@/components/ui/panel'
import { PodiumReveal } from '@/components/ui/motion'

const podiumColors = [
  'border-gold/40 bg-gold/5',
  'border-silver/40 bg-silver/5',
  'border-bronze/40 bg-bronze/5',
]

const podiumLabels = ['1st', '2nd', '3rd']

export function PodiumCard({ podium }: { podium: RaceResult[] }) {
  if (podium.length === 0) return null

  return (
    <PodiumReveal>
      {podium.map((result) => {
        const teamColor = teamColorOf(result.constructor.color, null)
        const idx = (result.position ?? 1) - 1

        return (
          <Panel key={result.driver.ref} className={`${podiumColors[idx]} border`}>
            <PanelContent className="space-y-1 px-4 py-3">
              <p className="label">{podiumLabels[idx]}</p>
              <Link
                href={`/drivers/${result.driver.ref}`}
                className="hover:text-primary text-sm font-semibold transition-colors"
              >
                {result.driver.firstName} {result.driver.lastName}
              </Link>
              <div className="flex items-center gap-1.5">
                {teamColor && (
                  <span className="inline-block h-3 w-1" style={{ backgroundColor: teamColor }} />
                )}
                <Link
                  href={`/constructors/${result.constructor.ref}`}
                  className="text-muted-foreground hover:text-foreground text-xs transition-colors"
                >
                  {result.constructor.name}
                </Link>
              </div>
            </PanelContent>
          </Panel>
        )
      })}
    </PodiumReveal>
  )
}
