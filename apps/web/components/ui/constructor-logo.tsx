import { cn } from '@/lib/utils'

interface ConstructorLogoProps {
  name: string
  size?: 'sm' | 'md' | 'lg'
  color?: string | null
  className?: string
}

const sizeMap = {
  sm: 'h-7 w-7 text-[10px]',
  md: 'h-10 w-10 text-sm',
  lg: 'h-16 w-16 text-xl',
} as const

/**
 * Constructor identity mark: abbreviation on the team color.
 *
 * Team badges are registered trademarks and are deliberately not reproduced.
 * See ATTRIBUTIONS.md.
 */
export function ConstructorLogo({ name, size = 'sm', color, className }: ConstructorLogoProps) {
  const abbr = name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div
      aria-label={name}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-md font-bold text-white',
        sizeMap[size],
        className,
      )}
      style={{ backgroundColor: color ?? 'var(--primary)' }}
    >
      {abbr}
    </div>
  )
}
