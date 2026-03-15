'use client'

import { useCallback, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { DriverSelect } from '@/components/compare/driver-select'
import { ConstructorSelect } from '@/components/compare/constructor-select'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FadeIn } from '@/components/ui/motion'

const suggestedDriverComparisons = [
  { d1: 'hamilton', d2: 'max_verstappen', label: 'Hamilton vs Verstappen' },
  { d1: 'michael_schumacher', d2: 'hamilton', label: 'Schumacher vs Hamilton' },
  { d1: 'senna', d2: 'prost', label: 'Senna vs Prost' },
  { d1: 'fangio', d2: 'clark', label: 'Fangio vs Clark' },
]

const suggestedConstructorComparisons = [
  { c1: 'ferrari', c2: 'mclaren', label: 'Ferrari vs McLaren' },
  { c1: 'mercedes', c2: 'red_bull', label: 'Mercedes vs Red Bull' },
  { c1: 'ferrari', c2: 'williams', label: 'Ferrari vs Williams' },
]

function DriverCompareForm({ prefillD1 }: { prefillD1: string }) {
  const router = useRouter()
  const [d1, setD1] = useState({ ref: prefillD1, name: '' })
  const [d2, setD2] = useState({ ref: '', name: '' })

  const canCompare = d1.ref && d2.ref && d1.ref !== d2.ref

  const handleCompare = useCallback(() => {
    if (canCompare) {
      router.push(`/compare/drivers?d1=${d1.ref}&d2=${d2.ref}`)
    }
  }, [canCompare, d1.ref, d2.ref, router])

  return (
    <>
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

      <div className="space-y-3">
        <h3 className="text-muted-foreground text-sm font-medium tracking-wider uppercase">
          Popular Comparisons
        </h3>
        <div className="flex flex-wrap gap-2">
          {suggestedDriverComparisons.map((comp) => (
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
    </>
  )
}

function ConstructorCompareForm() {
  const router = useRouter()
  const [c1, setC1] = useState({ ref: '', name: '' })
  const [c2, setC2] = useState({ ref: '', name: '' })

  const canCompare = c1.ref && c2.ref && c1.ref !== c2.ref

  const handleCompare = useCallback(() => {
    if (canCompare) {
      router.push(`/compare/constructors?c1=${c1.ref}&c2=${c2.ref}`)
    }
  }, [canCompare, c1.ref, c2.ref, router])

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Select Constructors</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-[1fr_auto_1fr]">
            <ConstructorSelect
              label="Constructor 1"
              value={c1.ref}
              onChange={(ref, name) => setC1({ ref, name })}
            />
            <div className="hidden items-center md:flex">
              <span className="font-heading text-muted-foreground text-2xl font-bold">VS</span>
            </div>
            <ConstructorSelect
              label="Constructor 2"
              value={c2.ref}
              onChange={(ref, name) => setC2({ ref, name })}
            />
          </div>

          {c1.ref && c2.ref && c1.ref === c2.ref && (
            <p className="text-destructive mt-4 text-sm">
              Please select two different constructors.
            </p>
          )}

          <Button className="mt-6" disabled={!canCompare} onClick={handleCompare}>
            Compare
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h3 className="text-muted-foreground text-sm font-medium tracking-wider uppercase">
          Popular Comparisons
        </h3>
        <div className="flex flex-wrap gap-2">
          {suggestedConstructorComparisons.map((comp) => (
            <Link
              key={comp.label}
              href={`/compare/constructors?c1=${comp.c1}&c2=${comp.c2}`}
              className="glass hover:border-primary/30 hover:bg-accent/50 rounded-lg px-3 py-1.5 text-sm transition-colors"
            >
              {comp.label}
            </Link>
          ))}
        </div>
      </div>
    </>
  )
}

export default function ComparePage() {
  const searchParams = useSearchParams()
  const prefillD1 = searchParams.get('d1') ?? ''

  return (
    <div className="space-y-8">
      <PageHeader
        title="Compare"
        description="Select two drivers or constructors to compare their career stats and head-to-head record"
      />

      <Tabs defaultValue={0}>
        <TabsList variant="line">
          <TabsTrigger value={0}>Drivers</TabsTrigger>
          <TabsTrigger value={1}>Constructors</TabsTrigger>
        </TabsList>
        <TabsContent value={0}>
          <FadeIn>
            <div className="space-y-8">
              <DriverCompareForm prefillD1={prefillD1} />
            </div>
          </FadeIn>
        </TabsContent>
        <TabsContent value={1}>
          <FadeIn>
            <div className="space-y-8">
              <ConstructorCompareForm />
            </div>
          </FadeIn>
        </TabsContent>
      </Tabs>
    </div>
  )
}
