import { cn } from '@/lib/utils'

interface DriverAvatarProps {
  firstName: string
  lastName: string
  /** Tailwind size class or pixel size. Defaults to 'sm' */
  size?: 'sm' | 'md' | 'lg'
  /** Team color used as the initials background */
  teamColor?: string
  className?: string
}

const sizeMap = {
  sm: 'h-7 w-7 text-[10px]',
  md: 'h-10 w-10 text-sm',
  lg: 'h-16 w-16 text-xl',
} as const

/**
 * Driver identity mark: initials on the team color.
 *
 * Photographs are deliberately not used — every available source (F1 press
 * media via OpenF1, Wikimedia Commons) carries its own licence and attribution
 * obligations. See ATTRIBUTIONS.md.
 */
export function DriverAvatar({
  firstName,
  lastName,
  size = 'sm',
  teamColor,
  className,
}: DriverAvatarProps) {
  const initials = (firstName?.[0] ?? '') + (lastName?.[0] ?? '')

  return (
    <div
      aria-label={`${firstName} ${lastName}`}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-bold text-white',
        sizeMap[size],
        className,
      )}
      style={{ backgroundColor: teamColor ?? 'var(--primary)' }}
    >
      {initials}
    </div>
  )
}
