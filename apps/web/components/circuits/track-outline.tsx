import { cn } from '@/lib/utils'

export function TrackOutline({
  svgId,
  name,
  className,
}: {
  svgId: string
  name: string
  className?: string
}) {
  const url = `url(/tracks/${svgId}.svg)`
  return (
    <div
      role="img"
      aria-label={`${name} layout`}
      className={cn('bg-accent-livery', className)}
      style={{
        maskImage: url,
        WebkitMaskImage: url,
        maskSize: 'contain',
        WebkitMaskSize: 'contain',
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
        maskPosition: 'center',
        WebkitMaskPosition: 'center',
      }}
    />
  )
}
