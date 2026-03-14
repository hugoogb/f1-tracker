'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface ListFilterProps {
  label: string
  paramName: string
  options: string[]
}

export function ListFilter({ label, paramName, options }: ListFilterProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const current = searchParams.get(paramName) ?? ''

  function handleChange(value: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (value && value !== 'all') {
      params.set(paramName, value)
    } else {
      params.delete(paramName)
    }
    params.delete('page')
    router.push(`?${params.toString()}`)
  }

  return (
    <div className="flex items-center gap-2">
      <label className="text-muted-foreground text-sm">{label}:</label>
      <Select value={current || 'all'} onValueChange={handleChange}>
        <SelectTrigger className="h-9 w-[180px]">
          <SelectValue placeholder="All" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          {options.map((opt) => (
            <SelectItem key={opt} value={opt}>
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
