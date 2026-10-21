'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'

function Table({ className, ...props }: React.ComponentProps<'table'>) {
  return (
    <div
      data-slot="table-container"
      className="border-hairline bg-surface-1 relative w-full overflow-x-auto border"
    >
      <table
        data-slot="table"
        className={cn('font-data w-full caption-bottom text-sm tabular-nums', className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return (
    <thead
      data-slot="table-header"
      className={cn(
        'bg-surface-2 [&_tr]:border-hairline [&_tr]:border-b [&_tr]:border-solid',
        className,
      )}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return (
    <tbody
      data-slot="table-body"
      className={cn('[&_tr:last-child]:border-0', className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        'bg-surface-2 border-hairline border-t font-medium [&>tr]:last:border-b-0',
        className,
      )}
      {...props}
    />
  )
}

/**
 * `highlight="leader"` paints the broadcast slab — the red leader/winner row.
 * Use it for at most one row per table.
 */
function TableRow({
  className,
  highlight,
  ...props
}: React.ComponentProps<'tr'> & { highlight?: 'leader' }) {
  return (
    <tr
      data-slot="table-row"
      data-highlight={highlight}
      className={cn(
        'border-hairline hover:bg-surface-2 data-[state=selected]:bg-surface-2 border-b border-dashed transition-colors duration-150',
        highlight === 'leader' &&
          'bg-primary/15 hover:bg-primary/20 [&>td:first-child]:shadow-[inset_3px_0_0_var(--primary)]',
        className,
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        'label h-10 px-4 text-left align-middle font-semibold whitespace-nowrap [&:has([role=checkbox])]:pr-0',
        className,
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        'px-4 py-3 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0',
        className,
      )}
      {...props}
    />
  )
}

function TableCaption({ className, ...props }: React.ComponentProps<'caption'>) {
  return (
    <caption
      data-slot="table-caption"
      className={cn('text-muted-foreground mt-4 text-sm', className)}
      {...props}
    />
  )
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption }
