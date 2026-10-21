import * as React from 'react'

import { liveryStyle } from '@/lib/livery'
import { cn } from '@/lib/utils'

/**
 * The telemetry panel: a flat surface with a hairline border and HUD corner
 * brackets in the page accent. `accent` puts just this panel in a team's
 * colours. The sub-parts keep the old Card API so call sites read the same.
 */
function Panel({
  className,
  style,
  accent,
  brackets = true,
  size = 'default',
  ...props
}: React.ComponentProps<'div'> & {
  accent?: string | null
  brackets?: boolean
  size?: 'default' | 'sm'
}) {
  return (
    <div
      data-slot="panel"
      data-size={size}
      style={{ ...liveryStyle(accent), ...style }}
      className={cn(
        'group/panel bg-surface-1 border-hairline text-card-foreground relative flex flex-col gap-5 border py-5 text-sm has-data-[slot=panel-footer]:pb-0 data-[size=sm]:gap-3 data-[size=sm]:py-3',
        brackets && 'brackets',
        className,
      )}
      {...props}
    />
  )
}

function PanelHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="panel-header"
      className={cn(
        'grid auto-rows-min items-start gap-1 px-5 group-data-[size=sm]/panel:px-4 has-data-[slot=panel-action]:grid-cols-[1fr_auto] [.border-b]:pb-4',
        className,
      )}
      {...props}
    />
  )
}

function PanelTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="panel-title"
      className={cn('label text-foreground/85 text-xs font-semibold', className)}
      {...props}
    />
  )
}

function PanelDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="panel-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  )
}

function PanelAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="panel-action"
      className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)}
      {...props}
    />
  )
}

function PanelContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="panel-content"
      className={cn('px-5 group-data-[size=sm]/panel:px-4', className)}
      {...props}
    />
  )
}

function PanelFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="panel-footer"
      className={cn(
        'bg-surface-2 border-hairline flex items-center border-t px-5 py-4 group-data-[size=sm]/panel:px-4 group-data-[size=sm]/panel:py-3',
        className,
      )}
      {...props}
    />
  )
}

export { Panel, PanelHeader, PanelFooter, PanelTitle, PanelAction, PanelDescription, PanelContent }
