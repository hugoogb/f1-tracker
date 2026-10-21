import { cn } from '@/lib/utils'

/**
 * A circuit layout (f1db's white SVGs) drawn in the page accent: the SVG is
 * used as a mask over an accent-coloured box, so it follows the livery.
 */
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
