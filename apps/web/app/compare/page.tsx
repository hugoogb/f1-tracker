'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DriverSelect } from '@/components/compare/driver-select'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function ComparePage() {
  const router = useRouter()
  const [d1, setD1] = useState({ ref: '', name: '' })
  const [d2, setD2] = useState({ ref: '', name: '' })

  const canCompare = d1.ref && d2.ref && d1.ref !== d2.ref

  const handleCompare = useCallback(() => {
    if (canCompare) {
      router.push(`/compare/drivers?d1=${d1.ref}&d2=${d2.ref}`)
    }
  }, [canCompare, d1.ref, d2.ref, router])

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Compare Drivers</h1>
        <p className="text-muted-foreground mt-1">
          Select two drivers to compare their career stats and head-to-head record
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Select Drivers</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            <DriverSelect
              label="Driver 1"
              value={d1.ref}
              onChange={(ref, name) => setD1({ ref, name })}
            />
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
    </div>
  )
}
