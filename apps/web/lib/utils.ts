import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * A constructor's livery colour, with a neutral stand-in for teams the palette
 * does not cover.
 *
 * The palette lives in the backend (`src/ingestion/colors.py`) and reaches here
 * on every constructor payload, so this is only about the fallback. It used to
 * consult a second, client-side map keyed by Ergast-style refs (`red_bull`),
 * which never matched f1db's (`red-bull`) — every lookup missed, and anything
 * that relied on it alone rendered grey.
 */
export function teamColorOf(
  color?: string | null,
  fallback: string | null = '#888888',
): string | null {
  return color ?? fallback
}
