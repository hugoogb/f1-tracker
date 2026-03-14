'use client'

import { useRouter, useSearchParams } from 'next/navigation'

interface ListFilterProps {
  label: string
  paramName: string
  options: string[]
}

export function ListFilter({ label, paramName, options }: ListFilterProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const current = searchParams.get(paramName) ?? ''

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set(paramName, value)
    } else {
      params.delete(paramName)
    }
    params.delete('page') // Reset to page 1 when filtering
    router.push(`?${params.toString()}`)
  }

  return (
    <div className="flex items-center gap-2">
      <label className="text-muted-foreground text-sm">{label}:</label>
      <select
        value={current}
        onChange={(e) => handleChange(e.target.value)}
        className="border-border bg-background h-9 rounded-md border px-3 text-sm"
      >
        <option value="">All</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  )
}
