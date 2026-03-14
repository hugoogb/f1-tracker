import * as Flags from 'country-flag-icons/react/3x2'
import { cn } from '@/lib/utils'

type FlagCode = keyof typeof Flags

interface CountryFlagProps {
  /** ISO 3166-1 alpha-2 country code (e.g. "GB", "NL") */
  code: string | null | undefined
  className?: string
  /** Height in pixels (default 16). Width is 1.5x height. */
  size?: number
}

export function CountryFlag({ code, className, size = 16 }: CountryFlagProps) {
  if (!code) return null

  const Flag = Flags[code as FlagCode]
  if (!Flag) return null

  return (
    <Flag
      className={cn('inline-block shrink-0 rounded-[2px]', className)}
      style={{ width: Math.round(size * 1.5), height: size }}
    />
  )
}
