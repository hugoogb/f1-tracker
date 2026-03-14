import Image from 'next/image'
import { cn } from '@/lib/utils'

interface DriverAvatarProps {
  firstName: string
  lastName: string
  headshotUrl?: string | null
  /** Tailwind size class or pixel size. Defaults to 'sm' */
  size?: 'sm' | 'md' | 'lg'
  /** Team color for initials fallback background */
  teamColor?: string
  className?: string
}

const sizeMap = {
  sm: { container: 'h-7 w-7 text-[10px]', image: 28, sizes: '28px' },
  md: { container: 'h-10 w-10 text-sm', image: 40, sizes: '40px' },
  lg: { container: 'h-16 w-16 text-xl', image: 64, sizes: '64px' },
} as const

export function DriverAvatar({
  firstName,
  lastName,
  headshotUrl,
  size = 'sm',
  teamColor,
  className,
}: DriverAvatarProps) {
  const { container, image, sizes } = sizeMap[size]
  const initials = (firstName?.[0] ?? '') + (lastName?.[0] ?? '')

  if (headshotUrl) {
    return (
      <Image
        src={headshotUrl}
        alt={`${firstName} ${lastName}`}
        width={image}
        height={image}
        sizes={sizes}
        className={cn('shrink-0 rounded-full object-cover', container, className)}
      />
    )
  }

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-bold text-white',
        container,
        className,
      )}
      style={{ backgroundColor: teamColor ?? 'var(--primary)' }}
    >
      {initials}
    </div>
  )
}
