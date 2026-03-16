import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

import { TEAM_COLORS } from '@/lib/constants'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getTeamColor(
  ref: string,
  fallbackColor?: string | null,
  defaultColor: string | null = '#888888',
): string | null {
  return TEAM_COLORS[ref] ?? fallbackColor ?? defaultColor
}
