import Image from 'next/image'
import { cn } from '@/lib/utils'

interface ConstructorLogoProps {
  name: string
  logoUrl?: string | null
  size?: 'sm' | 'md' | 'lg'
  color?: string | null
  className?: string
}

const sizeMap = {
  sm: { container: 'h-7 w-7 text-[10px]', image: 28, sizes: '28px' },
  md: { container: 'h-10 w-10 text-sm', image: 40, sizes: '40px' },
  lg: { container: 'h-16 w-16 text-xl', image: 64, sizes: '64px' },
} as const

export function ConstructorLogo({
  name,
  logoUrl,
  size = 'sm',
  color,
  className,
}: ConstructorLogoProps) {
  const { container, image, sizes } = sizeMap[size]
  const abbr = name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  if (logoUrl) {
    return (
      <Image
        src={logoUrl}
        alt={name}
        width={image}
        height={image}
        sizes={sizes}
        className={cn('shrink-0 object-contain', container, className)}
      />
    )
  }

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-md font-bold text-white',
        container,
        className,
      )}
      style={{ backgroundColor: color ?? 'var(--primary)' }}
    >
      {abbr}
    </div>
  )
}
