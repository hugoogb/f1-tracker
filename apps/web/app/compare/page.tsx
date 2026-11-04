'use client'

import { Suspense, useCallback, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { DriverSelect } from '@/components/compare/driver-select'
import { ConstructorSelect } from '@/components/compare/constructor-select'
import { Button } from '@/components/ui/button'
import { Panel, PanelContent, PanelHeader, PanelTitle } from '@/components/ui/panel'
import { PageHero } from '@/components/ui/page-hero'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FadeIn } from '@/components/ui/motion'
import { comparePrefill, type PrefillSide } from '@/lib/compare-prefill'
import {
  CURATED_CONSTRUCTOR_PAIRS,
  CURATED_DRIVER_PAIRS,
  pairHref,
  type ComparisonKind,
  type CuratedPair,
} from '@/lib/curated-comparisons'

// The first few of the curated head-to-heads, as quick picks beside each form;
// `AllHeadToHeads` below lists the rest.
const suggestedDriverComparisons = CURATED_DRIVER_PAIRS.slice(0, 4)
const suggestedConstructorComparisons = CURATED_CONSTRUCTOR_PAIRS.slice(0, 3)

function DriverCompareForm({ prefill }: { prefill: PrefillSide }) {
  const router = useRouter()
  const [d1, setD1] = useState(prefill)
  const [d2, setD2] = useState({ ref: '', name: '' })

  const canCompare = d1.ref && d2.ref && d1.ref !== d2.ref

  const handleCompare = useCallback(() => {
    if (canCompare) {
      router.push(`/compare/drivers?d1=${d1.ref}&d2=${d2.ref}`)
    }
  }, [canCompare, d1.ref, d2.ref, router])

  return (
    <>
      <Panel>
        <PanelHeader>
          <PanelTitle>Select Drivers</PanelTitle>
        </PanelHeader>
        <PanelContent>
          <div className="grid gap-6 md:grid-cols-[1fr_auto_1fr]">
            <DriverSelect
              label="Driver 1"
              value={d1.ref}
              initialName={prefill.name}
              onChange={(ref, name) => setD1({ ref, name })}
            />
            <div className="hidden items-center md:flex">
              <span className="display text-muted-foreground text-2xl">VS</span>
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
        </PanelContent>
      </Panel>

      <div className="space-y-3">
        <h3 className="text-muted-foreground text-sm font-medium tracking-wider uppercase">
          Popular Comparisons
        </h3>
        <div className="flex flex-wrap gap-2">
          {suggestedDriverComparisons.map((comp) => (
            <Link
              key={comp.label}
              href={pairHref('drivers', comp)}
              className="border-hairline bg-surface-1 hover:bg-surface-2 focus-ring border px-3 py-1.5 text-sm transition-colors"
            >
              {comp.label}
            </Link>
          ))}
        </div>
      </div>
    </>
  )
}

function ConstructorCompareForm({ prefill }: { prefill: PrefillSide }) {
  const router = useRouter()
  const [c1, setC1] = useState(prefill)
  const [c2, setC2] = useState({ ref: '', name: '' })

  const canCompare = c1.ref && c2.ref && c1.ref !== c2.ref

  const handleCompare = useCallback(() => {
    if (canCompare) {
      router.push(`/compare/constructors?c1=${c1.ref}&c2=${c2.ref}`)
    }
  }, [canCompare, c1.ref, c2.ref, router])

  return (
    <>
      <Panel>
        <PanelHeader>
          <PanelTitle>Select Constructors</PanelTitle>
        </PanelHeader>
        <PanelContent>
          <div className="grid gap-6 md:grid-cols-[1fr_auto_1fr]">
            <ConstructorSelect
              label="Constructor 1"
              value={c1.ref}
              initialName={prefill.name}
              onChange={(ref, name) => setC1({ ref, name })}
            />
            <div className="hidden items-center md:flex">
              <span className="display text-muted-foreground text-2xl">VS</span>
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
        </PanelContent>
      </Panel>

      <div className="space-y-3">
        <h3 className="text-muted-foreground text-sm font-medium tracking-wider uppercase">
          Popular Comparisons
        </h3>
        <div className="flex flex-wrap gap-2">
          {suggestedConstructorComparisons.map((comp) => (
            <Link
              key={comp.label}
              href={pairHref('constructors', comp)}
              className="border-hairline bg-surface-1 hover:bg-surface-2 focus-ring border px-3 py-1.5 text-sm transition-colors"
            >
              {comp.label}
            </Link>
          ))}
        </div>
      </div>
    </>
  )
}

// Title fights worth replaying round by round. Any season has the same view
// behind the Compare button on its own page.
const suggestedSeasonComparisons = [
  {
    href: '/seasons/2021/compare?type=drivers&a=max-verstappen&b=lewis-hamilton',
    label: '2021: Verstappen vs Hamilton',
  },
  {
    href: '/seasons/2016/compare?type=drivers&a=nico-rosberg&b=lewis-hamilton',
    label: '2016: Rosberg vs Hamilton',
  },
  {
    href: '/seasons/2007/compare?type=constructors&a=ferrari&b=mclaren',
    label: '2007: Ferrari vs McLaren',
  },
  {
    href: '/seasons/1988/compare?type=drivers&a=ayrton-senna&b=alain-prost',
    label: '1988: Senna vs Prost',
  },
]

function SeasonCompareLinks() {
  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>Within a Season</PanelTitle>
      </PanelHeader>
      <PanelContent className="space-y-3">
        <p className="text-muted-foreground text-sm">
          Follow two drivers or constructors through one season: the points gap round by round,
          finishes, grids and qualifying gaps. Open any season and press Compare, or start here.
        </p>
        <div className="flex flex-wrap gap-2">
          {suggestedSeasonComparisons.map((comp) => (
            <Link
              key={comp.href}
              href={comp.href}
              className="border-hairline bg-surface-1 hover:bg-surface-2 focus-ring border px-3 py-1.5 text-sm transition-colors"
            >
              {comp.label}
            </Link>
          ))}
          <Link
            href="/seasons"
            className="text-primary focus-ring px-3 py-1.5 text-sm hover:underline"
          >
            Pick a season →
          </Link>
        </div>
      </PanelContent>
    </Panel>
  )
}

function PairLinks({ kind, pairs }: { kind: ComparisonKind; pairs: readonly CuratedPair[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {pairs.map((pair) => (
        <li key={pair.label}>
          <Link
            href={pairHref(kind, pair)}
            prefetch={false}
            className="border-hairline bg-surface-1 hover:bg-surface-2 focus-ring block border px-3 py-1.5 text-sm transition-colors"
          >
            {pair.label}
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** Outside the Suspense below, so these reach a crawler: the only links to these pages. */
function AllHeadToHeads() {
  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>F1 rivalries, head to head</PanelTitle>
      </PanelHeader>
      <PanelContent className="space-y-5">
        <div className="space-y-2">
          <h2>Drivers</h2>
          <PairLinks kind="drivers" pairs={CURATED_DRIVER_PAIRS} />
        </div>
        <div className="space-y-2">
          <h2>Teams</h2>
          <PairLinks kind="constructors" pairs={CURATED_CONSTRUCTOR_PAIRS} />
        </div>
      </PanelContent>
    </Panel>
  )
}

/**
 * `useSearchParams` bails out of server rendering up to the nearest Suspense
 * boundary. Keeping that boundary around the forms alone leaves the heading and
 * links in the HTML, rather than a page a crawler sees as blank.
 */
function ComparePicker() {
  const searchParams = useSearchParams()
  const prefill = comparePrefill(searchParams)

  return (
    <Tabs defaultValue={prefill.tab}>
      <TabsList variant="line">
        <TabsTrigger value={0}>Drivers</TabsTrigger>
        <TabsTrigger value={1}>Constructors</TabsTrigger>
      </TabsList>
      <TabsContent value={0}>
        <FadeIn>
          <div className="space-y-8">
            <DriverCompareForm prefill={prefill.d1} />
          </div>
        </FadeIn>
      </TabsContent>
      <TabsContent value={1}>
        <FadeIn>
          <div className="space-y-8">
            <ConstructorCompareForm prefill={prefill.c1} />
          </div>
        </FadeIn>
      </TabsContent>
    </Tabs>
  )
}

export default function ComparePage() {
  return (
    <div className="space-y-8">
      <PageHero
        eyebrow="Head to head"
        title="Compare F1 drivers and teams"
        description="Select two drivers or constructors to compare their career stats and head-to-head record"
      />

      <Suspense>
        <ComparePicker />
      </Suspense>

      <AllHeadToHeads />

      <SeasonCompareLinks />
    </div>
  )
}
