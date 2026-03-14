'use client'

import { useCallback, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { DriverSelect } from '@/components/compare/driver-select'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'

const suggestedComparisons = [
  { d1: 'hamilton', d2: 'max_verstappen', label: 'Hamilton vs Verstappen' },
  { d1: 'michael_schumacher', d2: 'hamilton', label: 'Schumacher vs Hamilton' },
  { d1: 'senna', d2: 'prost', label: 'Senna vs Prost' },
  { d1: 'fangio', d2: 'clark', label: 'Fangio vs Clark' },
]

export default function ComparePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const prefillD1 = searchParams.get('d1') ?? ''
  const [d1, setD1] = useState({ ref: prefillD1, name: '' })
  const [d2, setD2] = useState({ ref: '', name: '' })

  const canCompare = d1.ref && d2.ref && d1.ref !== d2.ref

  const handleCompare = useCallback(() => {
    if (canCompare) {
      router.push(`/compare/drivers?d1=${d1.ref}&d2=${d2.ref}`)
    }
  }, [canCompare, d1.ref, d2.ref, router])

  return (
    <div className="space-y-8">
      <PageHeader
        title="Compare Drivers"
        description="Select two drivers to compare their career stats and head-to-head record"
      />

      <Card>
        <CardHeader>
          <CardTitle>Select Drivers</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-[1fr_auto_1fr]">
            <DriverSelect
              label="Driver 1"
              value={d1.ref}
              onChange={(ref, name) => setD1({ ref, name })}
            />
            <div className="hidden items-center md:flex">
              <span className="font-heading text-muted-foreground text-2xl font-bold">VS</span>
            </div>
            <DriverSelect
              label="Driver 2"
              value={d2.ref}
              onChange={(ref, name) => setD2({ ref, name })}
            />
          </div>

          {d1.ref && d2.ref && d1.ref === d2.ref && (
            <p className="text-destructive mt-4 text-sm">Please select two different drivers.</p>
          )}

          <Button className="mt-6" disabled={!canCompare} onClick={handleCompare}>
            Compare
          </Button>
        </CardContent>
      </Card>

      {/* Suggested Comparisons */}
      <div className="space-y-3">
        <h3 className="text-muted-foreground text-sm font-medium tracking-wider uppercase">
          Popular Comparisons
        </h3>
        <div className="flex flex-wrap gap-2">
          {suggestedComparisons.map((comp) => (
            <Link
              key={comp.label}
              href={`/compare/drivers?d1=${comp.d1}&d2=${comp.d2}`}
              className="glass hover:border-primary/30 hover:bg-accent/50 rounded-lg px-3 py-1.5 text-sm transition-colors"
            >
              {comp.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
