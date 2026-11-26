'use client'

import { useCallback, useState } from 'react'

import { driverCode, teamColorOf } from '@/lib/utils'

interface ToggleDriver {
  driver: { ref: string; code?: string | null; lastName: string }
  constructor: { color?: string | null }
}

export function useDriverToggles(
  drivers: readonly ToggleDriver[],
  initial: number,
): [ReadonlySet<string>, (ref: string) => void] {
  const [enabled, setEnabled] = useState<Set<string>>(
    () => new Set(drivers.slice(0, initial).map((d) => d.driver.ref)),
  )
  const toggle = useCallback(
    (ref: string) =>
      setEnabled((prev) => {
        const next = new Set(prev)
        if (next.has(ref)) next.delete(ref)
        else next.add(ref)
        return next
      }),
    [],
  )
  return [enabled, toggle]
}

export function DriverToggles({
  drivers,
  enabled,
  onToggle,
}: {
  drivers: readonly ToggleDriver[]
  enabled: ReadonlySet<string>
  onToggle: (ref: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {drivers.map((d) => {
        const on = enabled.has(d.driver.ref)
        return (
          <button
            key={d.driver.ref}
            onClick={() => onToggle(d.driver.ref)}
            aria-pressed={on}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all ${
              on
                ? 'border-transparent text-white'
                : 'border-border text-muted-foreground opacity-50 hover:opacity-75'
            }`}
            style={on ? { backgroundColor: teamColorOf(d.constructor.color) } : undefined}
          >
            {driverCode(d.driver)}
          </button>
        )
      })}
    </div>
  )
}
