'use client'

import { useRouter } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { SeasonCompareType } from '@/lib/types'

export interface PickerOption {
  ref: string
  label: string
  color: string
}

/**
 * Constructors | Drivers tabs and the two pickers, all driven by the URL.
 *
 * Every change is a navigation to `?type=&a=&b=`, so the page stays a plain
 * server render of its search params and any comparison is a shareable link.
 * Switching tab drops the pair and lets the page default to the top two.
 */
export function ComparePickers({
  year,
  type,
  a,
  b,
  constructors,
  drivers,
}: {
  year: number
  type: SeasonCompareType
  a: string
  b: string
  constructors: PickerOption[]
  drivers: PickerOption[]
}) {
  const router = useRouter()
  const options = type === 'drivers' ? drivers : constructors

  const go = (next: { type: SeasonCompareType; a?: string; b?: string }) => {
    const params = new URLSearchParams({ type: next.type })
    if (next.a) params.set('a', next.a)
    if (next.b) params.set('b', next.b)
    router.push(`/seasons/${year}/compare?${params}`, { scroll: false })
  }

  const pick = (side: 'a' | 'b', ref: string | null) => {
    if (!ref) return
    let nextA = side === 'a' ? ref : a
    let nextB = side === 'b' ? ref : b
    // Picking the other side's entity swaps them rather than comparing it with itself.
    if (nextA === nextB) {
      nextA = side === 'a' ? ref : b
      nextB = side === 'b' ? ref : a
    }
    go({ type, a: nextA, b: nextB })
  }

  return (
    <div className="space-y-4">
      <Tabs value={type} onValueChange={(value) => go({ type: value as SeasonCompareType })}>
        <TabsList variant="line">
          <TabsTrigger value="constructors">Constructors</TabsTrigger>
          <TabsTrigger value="drivers">Drivers</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid items-end gap-4 md:grid-cols-[1fr_auto_1fr]">
        <Picker label="Side A" value={a} options={options} onChange={(ref) => pick('a', ref)} />
        <span className="display text-muted-foreground hidden pb-1.5 text-xl md:block">VS</span>
        <Picker label="Side B" value={b} options={options} onChange={(ref) => pick('b', ref)} />
      </div>
    </div>
  )
}

function Picker({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: PickerOption[]
  onChange: (ref: string | null) => void
}) {
  const byRef = new Map(options.map((o) => [o.ref, o]))
  return (
    <div className="space-y-1.5">
      <span className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
        {label}
      </span>
      <Select value={value} onValueChange={(v: string | null) => onChange(v)}>
        <SelectTrigger className="h-9 w-full" aria-label={label}>
          <SelectValue>
            {(v: string | null) => {
              const option = v ? byRef.get(v) : undefined
              return option ? (
                <span className="flex items-center gap-2">
                  <span
                    className="inline-block size-2.5 shrink-0"
                    style={{ backgroundColor: option.color }}
                  />
                  {option.label}
                </span>
              ) : (
                'Select…'
              )
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.ref} value={o.ref}>
              <span className="flex items-center gap-2">
                <span
                  className="inline-block size-2.5 shrink-0"
                  style={{ backgroundColor: o.color }}
                />
                {o.label}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
