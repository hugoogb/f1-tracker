import { cn } from '@/lib/utils'

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        'animate-[shimmer_2s_ease-in-out_infinite] rounded-md bg-gradient-to-r from-[var(--surface-1)] via-[var(--surface-2)] to-[var(--surface-1)] bg-[length:200%_100%]',
        className,
      )}
      {...props}
    />
  )
}

export { Skeleton }
