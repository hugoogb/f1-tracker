'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { buttonVariants } from '@/components/ui/button-variants'
import { pageHref } from '@/lib/seo'
import { cn } from '@/lib/utils'

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

/** Real links, not click handlers: a crawler only follows an `<a href>`. */
export function Pagination({ total, page, pageSize }: PaginationProps) {
  const pathname = usePathname()
  const search = useSearchParams().toString()
  const totalPages = Math.ceil(total / pageSize)

  if (totalPages <= 1) return null

  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)
  const href = (target: number) => pageHref(pathname, search, target)
  const stepClass = buttonVariants({ variant: 'outline', size: 'sm' })
  const disabledClass = 'pointer-events-none opacity-50'

  const pages = getPageNumbers(page, totalPages)

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-col items-center gap-3 pt-4 sm:flex-row sm:justify-between"
    >
      <p className="text-muted-foreground text-sm">
        Showing {start}-{end} of {total.toLocaleString()}
      </p>
      <div className="flex items-center gap-1">
        {page <= 1 ? (
          <span aria-disabled className={cn(stepClass, disabledClass)}>
            Previous
          </span>
        ) : (
          <Link href={href(page - 1)} rel="prev" prefetch={false} className={stepClass}>
            Previous
          </Link>
        )}
        <div className="hidden items-center gap-1 sm:flex">
          {pages.map((p, i) =>
            p === 'ellipsis' ? (
              <span key={`e${i}`} className="text-muted-foreground px-1.5 text-sm">
                ...
              </span>
            ) : (
              <Link
                key={p}
                href={href(p)}
                prefetch={false}
                aria-current={p === page ? 'page' : undefined}
                className={cn(
                  buttonVariants({ variant: p === page ? 'default' : 'outline', size: 'icon-sm' }),
                  'h-7 w-7 text-xs',
                )}
              >
                {p}
              </Link>
            ),
          )}
        </div>
        <span className="text-muted-foreground px-2 text-sm sm:hidden">
          {page} / {totalPages}
        </span>
        {page >= totalPages ? (
          <span aria-disabled className={cn(stepClass, disabledClass)}>
            Next
          </span>
        ) : (
          <Link href={href(page + 1)} rel="next" prefetch={false} className={stepClass}>
            Next
          </Link>
        )}
      </div>
    </nav>
  )
}
