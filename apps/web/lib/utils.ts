import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function teamColorOf(color?: string | null): string
export function teamColorOf(
  color: string | null | undefined,
  fallback: string | null,
): string | null
export function teamColorOf(
  color?: string | null,
  fallback: string | null = '#888888',
): string | null {
  return color ?? fallback
}

export function formatPoints(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

export function driverCode(driver: { code?: string | null; lastName: string }): string {
  return driver.code ?? driver.lastName.slice(0, 3).toUpperCase()
}
