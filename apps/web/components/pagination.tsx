'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'

interface PaginationProps {
  total: number
  page: number
  pageSize: number
}

function getPageNumbers(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)

  const pages: (number | 'ellipsis')[] = [1]

  if (current > 3) pages.push('ellipsis')

  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)

  for (let i = start; i <= end; i++) pages.push(i)

  if (current < total - 2) pages.push('ellipsis')

  pages.push(total)
  return pages
}

export function Pagination({ total, page, pageSize }: PaginationProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const totalPages = Math.ceil(total / pageSize)

  if (totalPages <= 1) return null

  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)

  function navigate(newPage: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(newPage))
    router.push(`?${params.toString()}`)
  }

  const pages = getPageNumbers(page, totalPages)

  return (
    <div className="flex flex-col items-center gap-3 pt-4 sm:flex-row sm:justify-between">
      <p className="text-muted-foreground text-sm">
        Showing {start}-{end} of {total.toLocaleString()}
      </p>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => navigate(page - 1)}>
          Previous
        </Button>
        <div className="hidden items-center gap-1 sm:flex">
          {pages.map((p, i) =>
            p === 'ellipsis' ? (
              <span key={`e${i}`} className="text-muted-foreground px-1.5 text-sm">
                ...
              </span>
            ) : (
              <Button
                key={p}
                variant={p === page ? 'default' : 'outline'}
                size="icon-sm"
                onClick={() => navigate(p)}
                className="h-7 w-7 text-xs"
              >
                {p}
              </Button>
            ),
          )}
        </div>
        <span className="text-muted-foreground px-2 text-sm sm:hidden">
          {page} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => navigate(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  )
}
