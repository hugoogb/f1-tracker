'use client'

import { Avatar } from '@avatar-generator/react'
import { robots, type RobotsOptions } from '@avatar-generator/style-robots'

import { cn } from '@/lib/utils'

const BASE: RobotsOptions = {
  seed: 'race-engineer',
  square: true,
  colors: ['#E6000C'],
  metalColors: ['#E4E9F0'],
  antenna: 'dish',
  eyeStyle: 'visor',
  mouthStyle: 'grille',
}

const SIZES = {
  sm: { ...BASE, size: 24 },
  md: { ...BASE, size: 28 },
} satisfies Record<string, RobotsOptions>

export function EngineerAvatar({
  size = 'md',
  className,
}: {
  size?: keyof typeof SIZES
  className?: string
}) {
  return (
    <Avatar
      style={robots}
      options={SIZES[size]}
      alt=""
      className={cn('shrink-0 rounded-sm', className)}
    />
  )
}
